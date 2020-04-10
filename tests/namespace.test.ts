import 'mocha'
import { expect } from 'chai'
import { Project, Namespace } from '../src'
import { QualifiedObjectType } from '../src/core/utils'

describe('Namespaces', function() {
   it('Should be able to create one', async function() {
      let project = new Project()

      let name = 'NewNamespace'
      let ns = await project.root.children.create(name)
      expect(ns.name).to.equal(name)
      expect(ns.qualifiedName).to.equal(name)
   })

   it('Qualified name should be correct', async function() {
      let project = new Project()

      let name = 'NewNamespace'
      let subName = 'ChildNewNamespace'
      let ns = await project.root.children.create(name)
      let subNs = await ns.children.create(subName)

      let res = project.get(QualifiedObjectType.Namespace, name)
      console.dir(res)

      expect(ns.name).to.equal(name)
      expect(ns.qualifiedName).to.equal(name)
      expect(subNs.name).to.equal(subName)
      expect(subNs.qualifiedName).to.equal(`${name}.${subName}`)
   })
})