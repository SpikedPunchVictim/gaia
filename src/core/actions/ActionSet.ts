/*
Notes:
   * GetActions retrieve QualifiedObjects under the provided parent
*/


export enum ActionSet {
   Batched = 'rfc-batched-actions',
   InstanceCreate = 'instance-create',
   InstanceDelete = 'instance-delete',
   InstanceGetById = 'instance-get-by-id',
   InstanceGetChildren = 'instance-get-children',
   InstanceMove = 'instance-move',
   InstanceRename = 'instance-rename',
   InstanceReorder = 'instance-reoder',
   InstanceUpdate = 'instance-update',
   FieldCreate = 'field-create',
   FieldDelete = 'field-delete',
   FieldGet = 'field-get',
   FieldRename = 'field-rename',
   FieldReorder = 'field-reorder',
   FieldReset = 'field-reset',
   FieldValueChange = 'field-value-change',
   ModelCreate = 'model-create',
   ModelDelete = 'model-delete',
   ModelGetById = 'model-get-by-id',
   ModelGetChildren = 'model-get-children',
   ModelMove = 'model-move',
   ModelRename = 'model-rename',
   ModelReorder = 'model-reorder',
   ModelUpdate = 'model-update',
   MemberCreate = 'member-create',
   MemberDelete = 'member-delete',
   MemberGet = 'member-get',
   MemberRename = 'member-rename',
   MemberReorder = 'member-reorder',
   MemberValueChange = 'member-value-change',
   NamespaceCreate = 'namespace-create',
   NamespaceDelete = 'namespace-delete',
   NamespaceGetById = 'namespace-get-by-id',
   NamespaceGetChildren = 'namespace-get-children',
   NamespaceMove = 'namespace-move',
   NamespaceRename = 'namespace-rename',
   NamespaceReorder = 'namespace-reorder',
   NamespaceUpdate = 'namespace-update',
   ParentChange = 'qualifiedobject-parent-change',
   ProjectCommit = 'project-commit',
   ProjectOpen = 'project-open',
   ObjectGetById = 'object-get-by-id'
}