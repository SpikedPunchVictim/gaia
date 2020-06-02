import { IQualifiedObject, QualifiedObject } from "../QualifiedObject";
import { INamespace, Namespace } from "../Namespace";
import { Switch, QualifiedObjectType, as } from "../utils/Types";
import { emit } from '../utils/Eventing'
import { IProject, IProjectContext } from "../Project";
import { ArgumentError } from "../../errors/ArgumentError";
import { NameCollisionError } from "../../errors/NameCollisionError";
import { QualifiedObjectGetChildrenAction } from "../actions/QualifiedObject";
import { RestoreInfo } from '../Restore'

import {
   NamespaceCollection,
   ObservableEvents,
   ModelCollection,
   InstanceCollection,
   ObservableCollection,
   IObservableCollection
} from "../collections";

import {
   IRfcAction,
   NamespaceCreateAction,
   ModelCreateAction,
   InstanceCreateAction,
   MemberCreateAction,
   BatchedActions,
   MemberValueChangeAction,
   FieldValueChangeAction,
   ModelGetChildrenAction,
   InstanceGetChildrenAction,
   MemberReorderAction,
   MemberDeleteAction,
   MemberGetAction,
   FieldGetAction,
   NamespaceUpdateAction,
   RfcAction,
   ModelUpdateAction,
   InstanceUpdateAction,
   NamespaceGetByIdAction,
   ModelGetByIdAction,
   InstanceGetByIdAction,
   NamespaceGetChildrenAction
} from "../actions";

import { Events } from "../Events";
import { IModel, Model } from "../Model";
import { IInstance, Instance } from "../Instance";
import { RfcError } from "../../errors/RfcError";
import { IMember, Member, MemberCreateInfo, MemberRestoreInfo } from "../Member";
import { IField, Field } from "../Field";
import { IValue, } from "../values/Value";
import { MemberValueChange, FieldValueChange } from "../values/Changes";
import { ChangeValueHandler } from "../values/ValueAttachment";
import { IndexableItem, ItemAdd, ItemRemove } from "../collections/ChangeSets";
import { IUidWarden } from "../UidWarden";
import { syncToMaster } from "../utils/Collections";
import { Composer } from "./Composer";
import { IndexOutOfRangeError } from "../../errors/IndexOutOfRangeError";
import { ObjectDoesNotExistError } from "../../errors/ObjectDoesNotExist";
import { Restore } from "./Restore";

export interface IOrchestrator {
   // Members
   /**
    * All new Members are created through here. When importing, existing Members go through
    * a different flow.
    * 
    * @param model The Model the new Members belong to
    * @param params New Member information
    */
   createMembers(model: IModel, params: MemberCreateInfo | Array<MemberCreateInfo>): Promise<IndexableItem<IMember>[]>
   updateMembers(model: IModel): Promise<IndexableItem<IMember>[]>
   reorderMember(model: IModel, from: number, to: number): Promise<IMember>
   deleteMembers(model: IModel, names: string[]): Promise<IndexableItem<IMember>[]>
   updateMemberValue(member: IMember, oldValue: IValue, newValue: IValue, changeValue: ChangeValueHandler): Promise<IValue>

   // Fields
   updateFields(instance: IInstance): Promise<IndexableItem<IField>[]>
   updateFieldValue(field: IField, oldValue: IValue, newValue: IValue, changeValue: ChangeValueHandler): Promise<IValue>

   // Qualified Objects
   createNamespace(parent: INamespace, name: string): Promise<INamespace>
   createModel(parent: INamespace, name: string): Promise<IModel>
   createInstance(parent: INamespace, model: IModel, name: string): Promise<IInstance>
   updateQualifiedObjects<T extends IQualifiedObject>(type: QualifiedObjectType, parent: INamespace): Promise<void>
   updateQualifiedObject<T extends IQualifiedObject>(obj: T): Promise<void>
   delete<T extends IQualifiedObject>(item: T | T[]): Promise<boolean>
   rename(source: IQualifiedObject, newName: string): Promise<IQualifiedObject>
   reorder(source: IQualifiedObject, from: number, to: number): Promise<IQualifiedObject>

   /**
    * Moves a Qualified Object to a new parent.
    * 
    * @param source The source to move
    * @param to The new parent Namesapce
    * @returns Returns the source Qualified Object
    */
   move(source: IQualifiedObject, to: INamespace): Promise<IQualifiedObject>

   /**
    * Retrieves a QualifiedObject by ID
    * 
    * @param type The type of QualifiedObject to retrieve
    * @param id The ID of the Object
    */
   getById(type: QualifiedObjectType, id: string): Promise<IQualifiedObject>
}

export class Orchestrator implements IOrchestrator {
   readonly project: IProject
   readonly context: IProjectContext
   private composer: Composer
   private restore: Restore

   private get rfc() {
      return this.project.rfc
   }

   private get uidWarden(): IUidWarden {
      return this.context.uidWarden
   }

   constructor(project: IProject, context: IProjectContext) {
      this.project = project
      this.context = context
      this.composer = new Composer(project, context)
      this.restore = new Restore(project, context, this.composer)
   }

   async createNamespace(parent: INamespace, name: string): Promise<INamespace> {
      let qualifiedName = parent.qualifiedName === "" ? name : `${parent.qualifiedName}.${name}`

      let namespace = new Namespace(name, parent, this.context, await this.uidWarden.generate({
         qualifiedName: qualifiedName,
         isMember: false,
         type: QualifiedObjectType.Namespace
      }))

      let index = parent.children.length

      await this.rfc.create(new NamespaceCreateAction(namespace, index))
         .fulfill(async (action) => {
            await this.uidWarden.register(namespace.id, namespace)
            this.composer.add(namespace, parent, index, action)
         })
         .reject(async (action: IRfcAction, err?: Error) => {
            throw new RfcError(action, err)
         })
         .commit()

      return namespace
   }

   async createModel(parent: INamespace, name: string): Promise<IModel> {
      let qualifiedName = parent.qualifiedName === "" ? name : `${parent.qualifiedName}.${name}`

      let model = new Model(name, parent, this.context, await this.uidWarden.generate({
         qualifiedName: qualifiedName,
         isMember: false,
         type: QualifiedObjectType.Model
      }))

      let index = parent.models.length

      await this.rfc.create(new ModelCreateAction(model, index))
         .fulfill(async (action) => {
            await this.uidWarden.register(model.id, model)
            this.composer.add(model, parent, index, action)
         })
         .reject(async (action: IRfcAction, err?: Error) => {
            throw new RfcError(action, err)
         })
         .commit()

      return model
   }

   async createInstance(parent: INamespace, model: IModel, name: string): Promise<IInstance> {
      let qualifiedName = parent.qualifiedName === "" ? name : `${parent.qualifiedName}.${name}`

      let instance = new Instance(name, parent, model, this.context, await this.uidWarden.generate({
         qualifiedName: qualifiedName,
         isMember: false,
         type: QualifiedObjectType.Instance
      }))

      let index = parent.instances.length

      await this.rfc.create(new InstanceCreateAction(instance, index))
         .fulfill(async (action) => {
            await this.uidWarden.register(instance.id, instance)
            this.composer.add(instance, parent, index, action)
         })
         .reject(async (action: IRfcAction, err?: Error) => {
            throw new RfcError(action, err)
         })
         .commit()

      return instance
   }

   async createMembers(model: IModel, params: MemberCreateInfo | Array<MemberCreateInfo>): Promise<IndexableItem<IMember>[]> {
      if (!Array.isArray(params)) {
         params = [params]
      }

      let actions = new Array<IndexableItem<MemberCreateAction>>()

      // Note: The id field is ignored since these Members have not been created yet
      let index = model.members.length
      for (let param of params) {
         let id = await this.context.uidWarden.generate({
            isMember: true,
            memberName: param.name
         })

         let member = new Member(model, param.name, param.value, this, id)
         let action = new MemberCreateAction(member.model, member, param.index || index)
         actions.push(new IndexableItem<MemberCreateAction>(action, param.index || index))
         index++
      }

      let toAdd: IndexableItem<IMember>[] = new Array<IndexableItem<IMember>>()

      await this.rfc.create(new BatchedActions(actions.map(a => a.item)))
         .fulfill(async (action) => {
            let collection = model.members
            let members = actions.map(a => a.item.source)

            collection.observable.customAdd(members, (change, add) => {
               // Provide order
               toAdd = actions.map(a => {
                  return new ItemAdd<IMember>(a.item.source, a.index)
               })

               emit([
                  { source: collection.observable, event: ObservableEvents.adding, data: toAdd },
                  { source: collection, event: ObservableEvents.adding, data: toAdd },
                  { source: collection.model, event: Events.Model.MemberAdding, data: action },
                  { source: this.project, event: Events.Model.MemberAdding, data: action }
               ])

               add(toAdd)

               // Register each Member with the UID Warden
               collection.observable.forEach(member => this.uidWarden.register(member.id, member))

               emit([
                  { source: collection.observable, event: ObservableEvents.added, data: change },
                  { source: collection, event: ObservableEvents.added, data: change },
                  { source: collection.model, event: Events.Model.MemberAdded, data: action },
                  { source: this.project, event: Events.Model.MemberAdded, data: action }
               ])
            })
         })
         .reject(async (action: IRfcAction, err?: Error) => {
            throw new RfcError(action, err)
         })
         .commit()

      return toAdd
   }

   async delete<T extends IQualifiedObject>(item: T | T[]): Promise<boolean> {
      return this.composer.delete(item)
   }

   async updateFields(instance: IInstance): Promise<IndexableItem<IField>[]> {
      // Ensure the Model is updated
      await this.updateMembers(instance.model)
      await this.updateQualifiedObject(instance)

      let getAction = new FieldGetAction(instance)

      let results = new Array<IndexableItem<IField>>()

      await this.rfc.create(getAction)
         .fulfill(async (action) => {
            let observable = instance.fields.observable
            let members = instance.model.members

            if (!getAction.contentsUpdated) {
               //@ts-ignore
               results = observable.map(field => new IndexableItem<IMember>(field, observable.indexOf(field)))
               return
            }

            for (let { item } of getAction.results) {
               let member = members.observable.find(m => m.name === item.name)

               if (member == undefined) {
                  throw new Error(`Expected Member to exist (${item.name}) does not exist in the Model`)
               }

               let field = new Field(instance, member, member.value.clone())
               results.push(new IndexableItem<IField>(field, item.index))
            }
         })
         .commit()

      return results
   }

   async updateMembers(model: IModel): Promise<IndexableItem<IMember>[]> {
      let observable = model.members.observable

      let results = new Array<IndexableItem<IMember>>()

      await this.rfc.create(new MemberGetAction(model))
         .fulfill(async (action) => {
            let getAction = <MemberGetAction>action

            // If no contents were updated, return what exists now
            if (!getAction.contentsUpdated) {
               //@ts-ignore
               results = model.members.observable.map(member => new IndexableItem<IMember>(member, observable.indexOf(member)))
               return
            }

            // Update the Members
            // Unpack into info objects and sort
            let unpacked = getAction.results.map(indexable => indexable.item)
            unpacked.sort((a, b) => a.index - b.index)

            // Ensure indexes are sequnetial
            for (let i = 0; i < unpacked.length; ++i) {
               if (unpacked[i].index != i) {
                  throw new Error(`Failed to retrieve an accurate list of Members. The indexes are not sequential.`)
               }
            }

            let observableResults = new ObservableCollection(...unpacked)

            // Merge the results
            syncToMaster<MemberRestoreInfo, IMember>(
               observableResults,
               model.members.observable,
               {
                  equal: (master: MemberRestoreInfo, other: IMember): boolean => master.id === other.id,
                  add: (master: MemberRestoreInfo, index: number, collection: IObservableCollection<IMember>): void => {
                     let member = new Member(model, master.name, master.value.clone(), this, master.id)

                     collection.customAdd(member, (change, add) => {
                        let action = new MemberCreateAction(model, member, index)

                        emit([
                           { source: collection, event: ObservableEvents.adding, data: change },
                           { source: model.members, event: ObservableEvents.adding, data: change },
                           { source: model, event: Events.Model.MemberAdding, data: action },
                           { source: this.project, event: Events.Model.MemberAdding, data: action }
                        ])

                        let updatedChange = new ItemAdd<IMember>(member, index)
                        add([updatedChange])

                        emit([
                           { source: collection, event: ObservableEvents.added, data: change },
                           { source: model.members, event: ObservableEvents.added, data: change },
                           { source: model, event: Events.Model.MemberAdded, data: action },
                           { source: this.project, event: Events.Model.MemberAdded, data: action }
                        ])
                     })
                  },
                  remove: (other: IMember, index: number, collection: IObservableCollection<IMember>): void => {
                     collection.customRemove(other, (change, remove) => {
                        let action = new MemberDeleteAction(other)

                        emit([
                           { source: collection, event: ObservableEvents.removing, data: change },
                           { source: model.members, event: ObservableEvents.removing, data: change },
                           { source: model, event: Events.Model.MemberRemoving, data: action },
                           { source: this.project, event: Events.Model.MemberRemoving, data: action }
                        ])

                        let updatedChange = new ItemRemove<IMember>(other, index)
                        remove([updatedChange])

                        emit([
                           { source: collection, event: ObservableEvents.removed, data: change },
                           { source: model.members, event: ObservableEvents.removed, data: change },
                           { source: model, event: Events.Model.MemberRemoved, data: action },
                           { source: this.project, event: Events.Model.MemberRemoved, data: action }
                        ])
                     })
                  },
                  move: (other: IMember, from: number, to: number, collection: IObservableCollection<IMember>): void => {
                     let member = collection.at(from)

                     collection.customMove(from, to, (change, move) => {
                        let action = new MemberReorderAction(member, from, to)

                        emit([
                           { source: collection, event: ObservableEvents.moving, data: change },
                           { source: model.members, event: ObservableEvents.moving, data: change },
                           { source: model, event: Events.Model.MemberMoving, data: action },
                           { source: this.project, event: Events.Model.MemberMoving, data: action }
                        ])

                        move()

                        emit([
                           { source: collection, event: ObservableEvents.moved, data: change },
                           { source: model.members, event: ObservableEvents.moved, data: change },
                           { source: model, event: Events.Model.MemberMoved, data: action },
                           { source: this.project, event: Events.Model.MemberMoved, data: action }
                        ])
                     })
                  }
               }
            )
         })
         .commit()

      return results
   }

   async rename(source: IQualifiedObject, newName: string): Promise<IQualifiedObject> {
      let action = this.composer.action.rename(source, newName)

      await this.rfc.create(action)
         .fulfill(async (action) => {
            emit([
               { source, event: Events.QualifiedObject.NameChanging, data: action },
               { source: this.project, event: Events.QualifiedObject.NameChanging, data: action }
            ])

            //@ts-ignore
            let qobj = as<QualifiedObject>(source)
            qobj.setName(newName)

            emit([
               { source, event: Events.QualifiedObject.NameChanged, data: action },
               { source: this.project, event: Events.QualifiedObject.NameChanged, data: action }
            ])

            return
         })
         .commit()

      return source
   }

   async move(source: IQualifiedObject, to: INamespace): Promise<IQualifiedObject> {
      if (source == null) {
         throw new ArgumentError(`source must be valid`)
      }

      if (source === this.project.root) {
         throw new ArgumentError(`Cannot move the Root namespace`)
      }

      if (source.parent == null) {
         throw new ArgumentError(`The source does not belong to any Namespace. Ensure that it exists in the project.`)
      }

      if (source.parent === to) {
         return Promise.resolve(source)
      }

      let found = await this.project.get(QualifiedObjectType.Namespace, to.qualifiedName)

      if (!found) {
         throw new ArgumentError(`The 'to' Namespace provided to move() doesn't exist in this project`)
      }

      // Is there a QualifiedObject with that name already at the destination?
      let exists = await Switch.case(source, {
         Namespace: async () => {
            let found = await to.children.get(source.name)
            return found !== undefined
         },
         Model: async () => {
            let found = await to.models.get(source.name)
            return found !== undefined
         },
         Instance: async () => {
            let found = await to.instances.get(source.name)
            return found !== undefined
         }
      })

      if (exists) {
         throw new NameCollisionError(`A QualifiedObject with that name already exists in the target location`)
      }

      let action = this.composer.action.move(source, to)

      await this.rfc.create(action)
         .fulfill(async (action) => {
            await Switch.case(source, {
               Namespace: async (ns) => this.composer.move(ns, to, to.children.length, action),
               Model: async (model) => this.composer.move(model, to, to.models.length, action),
               Instance: async (inst) => this.composer.move(inst, to, to.instances.length, action)
            })
         })
         .commit()

      return source
   }

   async updateMemberValue(member: IMember, oldValue: IValue, newValue: IValue, changeValue: ChangeValueHandler): Promise<IValue> {
      let change = new MemberValueChange(member, oldValue, newValue)
      let updatedValue: IValue

      await this.rfc.create(new MemberValueChangeAction(member, oldValue, newValue))
         .fulfill(async () => {
            emit([
               { source: member, event: Events.Member.ValueChanging, data: change },
               { source: member.model, event: Events.Model.ValueChanging, data: change },
               { source: this.project, event: Events.Model.ValueChanging, data: change }
            ])

            updatedValue = changeValue()

            emit([
               { source: member, event: Events.Member.ValueChanged, data: change },
               { source: member.model, event: Events.Model.ValueChanged, data: change },
               { source: this.project, event: Events.Model.ValueChanged, data: change }
            ])
         })
         .commit()

      //@ts-ignore
      return updatedValue
   }

   async updateFieldValue(field: IField, oldValue: IValue, newValue: IValue, changeValue: ChangeValueHandler): Promise<IValue> {
      let change = new FieldValueChange(field, oldValue, newValue)
      let updatedValue: IValue

      await this.rfc.create(new FieldValueChangeAction(field, oldValue, newValue))
         .fulfill(async () => {
            emit([
               { source: field, event: Events.Member.ValueChanging, data: change },
               { source: field.instance, event: Events.Instance.FieldValueChanging, data: change },
               { source: this.project, event: Events.Instance.FieldValueChanging, data: change }
            ])

            updatedValue = changeValue()

            emit([
               { source: field, event: Events.Member.ValueChanged, data: change },
               { source: field.instance, event: Events.Instance.FieldValueChanged, data: change },
               { source: this.project, event: Events.Instance.FieldValueChanged, data: change }
            ])
         })
         .commit()

      //@ts-ignore
      return updatedValue
   }

   /*
      composer
         .request(new InstanceGetAction(parent))
         .update()

   */

   async updateQualifiedObjects(type: QualifiedObjectType, parent: INamespace): Promise<void> {
      let action = Switch.onType<QualifiedObjectGetChildrenAction<RestoreInfo>>(type, {
         //@ts-ignore
         Namespace: () => new NamespaceGetChildrenAction(parent),
         //@ts-ignore
         Model: () => new ModelGetChildrenAction(parent),
         //@ts-ignore
         Instance: () => new InstanceGetChildrenAction(parent)
      })

      await this.rfc.create(action)
         .fulfill(async () => {
            if (!action.contentsUpdated) {
               return
            }

            if (action.restore === undefined) {
               // no action
            } else {
               let observable = Switch.onType(type, {
                  //@ts-ignore
                  Namespace: () => parent.children.observable,
                  //@ts-ignore
                  Model: () => parent.models.observable,
                  //@ts-ignore
                  Instance: () => parent.instances.observable
               })

               await this.restore.collection(
                  parent,
                  observable,
                  new ObservableCollection(...action.restore),
                  async (restore) => {
                     return await Switch.onType(type, {
                        //@ts-ignore
                        Namespace: () => new Namespace(restore.name, parent, this.context, restore.id),
                        //@ts-ignore
                        Model: () => new Model(restore.name, parent, this.context, restore.id),
                        //@ts-ignore
                        Instance: async () => {
                           //@ts-ignore
                           let model = await this.project.getById<IModel>(QualifiedObjectType.Model, restore.modelId)
                           return new Instance(restore.name, parent, model, this.context, restore.id)
                        }
                     })
                  })

            }
         })
         .commit()
   }

   async updateQualifiedObject<T extends IQualifiedObject>(obj: T): Promise<void> {
      let action = this.composer.action.update(obj)

      await this.rfc.create(action)
         .fulfill(async () => {
            await Switch.case(obj, {
               Namespace: async (ns) => {
                  let updateAction = RfcAction.as<NamespaceUpdateAction>(action)

                  if (!updateAction.contentsUpdated || updateAction.restore == null) {
                     return
                  }

                  if (!updateAction.exists) {
                     let namespace = ns as Namespace
                     return namespace.orphan()
                  }

                  await this.restore.namespace(ns, updateAction.restore)
               },
               Model: (model) => {
                  let updateAction = RfcAction.as<ModelUpdateAction>(action)

                  if (!updateAction.contentsUpdated) {
                     return
                  }
               },
               Instance: (inst) => {
                  let updateAction = RfcAction.as<InstanceUpdateAction>(action)

                  if (!updateAction.contentsUpdated) {
                     return
                  }
               }
            })

         })
         .commit()
   }

   async reorder(source: IQualifiedObject, from: number, to: number): Promise<IQualifiedObject> {
      let action = this.composer.action.reorder(source, from, to)

      await this.rfc.create(action)
         .fulfill(async () => {
            return Switch.case(source, {
               Namespace: (ns) => {
                  //@ts-ignore
                  let collection = <NamespaceCollection>ns.parent.children
                  this.composer.reorder<INamespace>(ns, collection, from, to, action)
               },
               Model: (model) => {
                  //@ts-ignore
                  let collection = <ModelCollection>ns.parent.models
                  this.composer.reorder<IModel>(model, collection, from, to, action)
               },
               Instance: (inst) => {
                  //@ts-ignore
                  let collection = <InstanceCollection>ns.parent.children
                  this.composer.reorder<IInstance>(inst, collection, from, to, action)
               }
            })
         })
         .commit()

      return source
   }

   async reorderMember(model: IModel, from: number, to: number): Promise<IMember> {
      let member = await model.members.at(from)

      if (member === undefined) {
         throw new Error(`A Member does not exist at that index (${from})`)
      }

      if (to < 0 || to >= (model.members.length + 1)) {
         throw new IndexOutOfRangeError(to, `The to index is out of range (${to}) for reodering a Member`)
      }

      await this.rfc.create(new MemberReorderAction(member, from, to))
         .fulfill(async (action) => {
            let collection = model.members.observable

            collection.customMove(from, to, (change, move) => {
               emit([
                  { source: collection, event: ObservableEvents.moving, data: change },
                  { source: model.members, event: ObservableEvents.moving, data: change },
                  { source: model, event: Events.Model.MemberMoving, data: action },
                  { source: this.project, event: Events.Model.MemberMoving, data: action }
               ])

               move()

               emit([
                  { source: collection, event: ObservableEvents.moved, data: change },
                  { source: model.members, event: ObservableEvents.moved, data: change },
                  { source: model, event: Events.Model.MemberMoved, data: action },
                  { source: this.project, event: Events.Model.MemberMoved, data: action }
               ])
            })

            return
         })
         .commit()

      return member
   }

   async deleteMembers(model: IModel, names: string[]): Promise<IndexableItem<IMember>[]> {
      let collection = model.members.observable

      let actions = collection
         .filter(member => member.name in names)
         .map(m => new MemberDeleteAction(m))

      let results = actions.map(action => {
         //@ts-ignore
         return new IndexableItem<IMember>(action.source, collection.indexOf(action.source))
      })

      await this.rfc.create(new BatchedActions(actions))
         .fulfill(async () => {
            collection.customRemove(actions.map(a => a.source), (change, remove) => {
               emit([
                  { source: collection, event: ObservableEvents.removing, data: change },
                  { source: model.members, event: ObservableEvents.removing, data: change },
                  { source: model, event: Events.Model.MemberRemoving, data: actions },
                  { source: this.project, event: Events.Model.MemberRemoving, data: actions }
               ])

               remove()

               emit([
                  { source: collection, event: ObservableEvents.removed, data: change },
                  { source: model.members, event: ObservableEvents.removed, data: change },
                  { source: model, event: Events.Model.MemberRemoved, data: actions },
                  { source: this.project, event: Events.Model.MemberRemoved, data: actions }
               ])
            })
         })
         .commit()

      return results
   }

   async getById(type: QualifiedObjectType, id: string): Promise<IQualifiedObject> {
      let result = await this.uidWarden.get(id)

      if (result != undefined) {
         return result as IQualifiedObject
      }

      let action = Switch.onType<IRfcAction>(type, {
         Namespace: () => new NamespaceGetByIdAction(id),
         Model: () => new ModelGetByIdAction(id),
         Instance: () => new InstanceGetByIdAction(id)
      })

      await this.rfc.create(action)
         .fulfill(async (action) => {
            await Switch.onType(type, {
               Namespace: async () => {
                  let { restore } = <NamespaceGetByIdAction>action

                  if (restore === undefined) {
                     throw new ObjectDoesNotExistError(`The id ${id} requested does not exist`)
                  }

                  result = await this.project.get(QualifiedObjectType.Namespace, restore.qualifiedPath)

                  if (result === undefined) {
                     throw new ObjectDoesNotExistError(`The id ${id} requested does not exist`)
                  }
               },
               Model: async () => {
                  let { restore } = <ModelGetByIdAction>action

                  if (restore === undefined) {
                     throw new ObjectDoesNotExistError(`The id ${id} requested does not exist`)
                  }

                  result = await this.project.get(QualifiedObjectType.Model, restore.qualifiedPath)

                  if (result === undefined) {
                     throw new ObjectDoesNotExistError(`The id ${id} requested does not exist`)
                  }
               },
               Instance: async () => {
                  let { restore } = <InstanceGetByIdAction>action

                  if (restore === undefined) {
                     throw new ObjectDoesNotExistError(`The id ${id} requested does not exist`)
                  }

                  result = await this.project.get(QualifiedObjectType.Instance, restore.qualifiedPath)

                  if (result === undefined) {
                     throw new ObjectDoesNotExistError(`The id ${id} requested does not exist`)
                  }
               }
            })
         })
         .commit()

      if (result === undefined) {
         throw new ObjectDoesNotExistError(`The id ${id} requested does not exist`)
      }

      return result
   }
}