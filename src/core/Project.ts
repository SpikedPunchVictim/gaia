import {
   basename,
   parentPath,
   QualifiedObjectType,
   Switch
} from './utils'

import { IRequestForChangeSource, RequestForChangeSource } from './actions/RequestForChange'
import { INamespace, RootNamespace } from './Namespace'
import { IQualifiedObject } from './QualifiedObject'
import { IPlugin } from './plugins/Plugin'
import { ActionRouter, IActionRouter } from './actions/ActionRouter'
import { ProjectOpenAction, ProjectCommitAction } from './actions/Project'
import { ArgumentError } from '../errors/ArgumentError'
import { InvalidOperationError } from '../errors/InvalidOperationError'
import { IOrchestrator, Orchestrator } from './orchestrator/Orchestrator'
import { EventEmitter } from 'events'
import { IUidWarden, HexUidWarden } from './UidWarden'
import { IValueFactory, ValueFactory } from './values/ValueFactory'
import { EmptyValueAttachment } from './values/ValueAttachment'
import { Search } from './Search'

export interface IProjectContext {
   readonly rfc: IRequestForChangeSource
   readonly router: IActionRouter
   readonly orchestrator: IOrchestrator
   readonly project: IProject
   readonly uidWarden: IUidWarden
   readonly valueFactory: IValueFactory
   readonly search: Search
}

class ProjectContext implements IProjectContext {
   get rfc(): IRequestForChangeSource {
      return this.project.rfc
   }

   get router(): IActionRouter {
      return this.project.router
   }

   readonly project: IProject
   readonly orchestrator: IOrchestrator
   readonly uidWarden: IUidWarden
   readonly valueFactory: IValueFactory
   readonly search: Search

   constructor(
      project: IProject,
      uidWarden: IUidWarden,
      valueFactory: IValueFactory = new ValueFactory(new EmptyValueAttachment())
   ) {
      this.project = project
      this.uidWarden = uidWarden
      this.orchestrator = new Orchestrator(project, this)
      this.valueFactory = valueFactory
      this.search = new Search(project)
   }
}

export interface IProject extends EventEmitter {
   readonly root: INamespace
   readonly router: IActionRouter
   readonly rfc: IRequestForChangeSource
   readonly name: string
   readonly uidWarden: IUidWarden

   /**
    * Retrieves the QualifiedObject athe the provided qualified path, or undefined if not found.
    * 
    * @param qualifiedType The type to retrieve
    * @param qualifiedPath The qualified path
    */
   get<TReturn extends IQualifiedObject>(qualifiedType: QualifiedObjectType, qualifiedPath: string): Promise<TReturn | undefined>

   /**
    * Retrieves a QualifiedObject by ID
    * 
    * @param id ID of the QualifiedObject to retrieve
    */
   getById<TReturn extends IQualifiedObject>(type: QualifiedObjectType, id: string): Promise<TReturn>

   /**
    * Creates all fo the Namespaces to complete the path. Returns
    * the last Namespace in the path.
    * 
    * @param qualifiedPath The period delimited qualified path
    */
   create(qualifiedPath: string): Promise<INamespace>

   /**
    * Deletes a Qualified Object at the provided qualified path
    * 
    * @param qualifiedType The QualifiedType
    * @param qualifiedPath The qualified path
    */
   delete(qualifiedType: QualifiedObjectType, qualifiedPath: string): Promise<boolean>

   /**
    * Moves a QualifiedObject from one place in the Namespace tree to another
    * 
    * @param qualifiedType The QualifiedType to move
    * @param fromPath The qualified path to the original QualifiedObject's location
    * @param toPath The qualified path to the destination
    */
   move(qualifiedType: QualifiedObjectType, fromPath: string, toPath: string): Promise<IQualifiedObject | undefined>

   // readonly search: ISearch

   // Custom plugin receives all Actions
   use(plugin: IPlugin): Promise<void>
   open(): Promise<void>
   commit(): Promise<void>
}

export interface IProjectOptions {
   rfcSource?: IRequestForChangeSource
   uidWarden?: IUidWarden
   rootId?: string
}

export class Project
   extends EventEmitter
   implements IProject {

   readonly root: INamespace
   readonly context: IProjectContext
   readonly router: IActionRouter
   readonly rfc: IRequestForChangeSource
   readonly name: string
   readonly uidWarden: IUidWarden

   get orchestrator(): IOrchestrator {
      return this.context.orchestrator
   }

   constructor(name: string, options?: IProjectOptions) {
      super()
      this.name = name
      this.router = new ActionRouter()
      this.rfc = options?.rfcSource || new RequestForChangeSource(this.router)
      this.uidWarden = options?.uidWarden || new HexUidWarden()
      this.context = new ProjectContext(this, this.uidWarden)

      let rootId = options?.rootId || `root_${this.name}`
      this.root = new RootNamespace(rootId, this.context)
   }

   open(): Promise<void> {
      return this.router.raise(new ProjectOpenAction(this))
   }

   commit(): Promise<void> {
      return this.router.raise(new ProjectCommitAction(this))
   }

   async get<TReturn extends IQualifiedObject>(qualifiedType: QualifiedObjectType, qualifiedPath: string): Promise<TReturn | undefined> {
      if (qualifiedPath == null) {
         throw new ArgumentError(`qualifiedPath must be valid when calling Project.get()`)
      }

      if (qualifiedPath === '' && qualifiedType === QualifiedObjectType.Namespace) {
         // Note: For Typescript, must convert to parent class before returning as TResult
         let result = this.root as IQualifiedObject
         return (result as TReturn)
      }

      let parentQPath = parentPath(qualifiedPath)

      if (parentQPath === undefined) {
         return undefined
      }

      let current: INamespace | undefined = this.root

      let tokens = parentQPath
         .split('.')
         .filter(it => it !== '')

      for (let token of tokens) {
         current = await current.children.get(token)

         if (current === undefined) {
            return undefined
         }
      }

      // current is the Parent Namespace at this point
      let baseQPath = basename(qualifiedPath)

      let result = await Switch.onType<Promise<IQualifiedObject | undefined>>(qualifiedType, {
         Namespace: async () => await current?.children.get(baseQPath),
         Model: async () => await current?.models.get(baseQPath),
         Instance: async () => await current?.instances.get(baseQPath)
      })

      if(result !== undefined) {
         await result.update()
      }

      return result === undefined ?
         undefined :
         (result as TReturn)
   }

   async getById<TReturn extends IQualifiedObject>(type: QualifiedObjectType, id: string): Promise<TReturn> {
      let obj = await this.orchestrator.getById(type, id)

      if(obj === undefined) {
         throw new Error(`No Object was found with ID ${id}`)
      }

      return obj as TReturn
   }

   async create(qualifiedPath: string): Promise<INamespace> {
      if (!qualifiedPath) {
         throw new ArgumentError(`qualifiedPath must be valid`)
      }

      let current = this.root
      let tokens = qualifiedPath.split('.')

      for (let token of tokens) {
         let child = await current.children.get(token)

         current = child === undefined ?
            await current.children.create(token) :
            child
      }

      return current
   }

   async delete(qualifiedType: QualifiedObjectType, qualifiedPath: string): Promise<boolean> {
      let obj = await this.get(qualifiedType, qualifiedPath)

      if (obj === undefined) {
         return false
      }

      if (obj === this.root) {
         throw new Error(`Cannot delete the Root Namespace`)
      }

      let parent = obj.parent

      if (parent == null) {
         throw new Error(`The QualifiedObject's parent is not valid. Validate the project is in the correct state. This should never happen, and may be a bug with the system.`)
      }

      let baseQName = basename(qualifiedPath)

      let result = await Switch.onType(qualifiedType, {
         Namespace: async () => parent?.children.delete(baseQName),
         Model: async () => parent?.models.delete(baseQName),
         Instance: async () => parent?.instances.delete(baseQName)
      })

      return result === undefined ? false : result
   }

   async move(qualifiedType: QualifiedObjectType, fromPath: string, toPath: string): Promise<IQualifiedObject | undefined> {
      let obj = await this.get(qualifiedType, fromPath)

      if (obj === undefined) {
         return Promise.resolve(undefined)
      }

      let to = await this.get(QualifiedObjectType.Namespace, toPath)

      if (to === undefined) {
         throw new InvalidOperationError(`Cannot move a QualifiedObject to a Namespace that does not exist. Ensure it's created before moving to it.`)
      }

      return await obj.move(to as INamespace)
   }

   async use(plugin: IPlugin): Promise<void> {
      await plugin.setup(this, this.router)
   }
}