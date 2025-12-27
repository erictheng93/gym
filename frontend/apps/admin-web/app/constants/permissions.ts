/**
 * 權限系統定義
 *
 * 定義系統中所有可用的模組和操作權限
 */

export type PermissionAction = 'create' | 'read' | 'update' | 'delete'

export interface PermissionModule {
  key: string
  label: string
  description: string
  actions: {
    key: PermissionAction
    label: string
  }[]
}

/**
 * 系統權限模組定義
 */
export const PERMISSION_MODULES: PermissionModule[] = [
  {
    key: 'members',
    label: '會員管理',
    description: '管理會員資料與狀態',
    actions: [
      { key: 'create', label: '新增會員' },
      { key: 'read', label: '檢視會員' },
      { key: 'update', label: '編輯會員' },
      { key: 'delete', label: '刪除會員' }
    ]
  },
  {
    key: 'contracts',
    label: '合約管理',
    description: '管理會員合約與續約',
    actions: [
      { key: 'create', label: '新增合約' },
      { key: 'read', label: '檢視合約' },
      { key: 'update', label: '編輯合約' },
      { key: 'delete', label: '刪除合約' }
    ]
  },
  {
    key: 'payments',
    label: '收款管理',
    description: '管理付款紀錄',
    actions: [
      { key: 'create', label: '新增付款' },
      { key: 'read', label: '檢視付款' },
      { key: 'update', label: '編輯付款' },
      { key: 'delete', label: '刪除付款' }
    ]
  },
  {
    key: 'plans',
    label: '會籍方案',
    description: '管理會籍方案設定',
    actions: [
      { key: 'create', label: '新增方案' },
      { key: 'read', label: '檢視方案' },
      { key: 'update', label: '編輯方案' },
      { key: 'delete', label: '刪除方案' }
    ]
  },
  {
    key: 'employees',
    label: '員工管理',
    description: '管理員工資料與職位',
    actions: [
      { key: 'create', label: '新增員工' },
      { key: 'read', label: '檢視員工' },
      { key: 'update', label: '編輯員工' },
      { key: 'delete', label: '刪除員工' }
    ]
  },
  {
    key: 'branches',
    label: '分店管理',
    description: '管理分店資料與設定',
    actions: [
      { key: 'create', label: '新增分店' },
      { key: 'read', label: '檢視分店' },
      { key: 'update', label: '編輯分店' },
      { key: 'delete', label: '刪除分店' }
    ]
  },
  {
    key: 'checkin',
    label: '會員入場',
    description: '管理會員簽到紀錄',
    actions: [
      { key: 'create', label: '登記入場' },
      { key: 'read', label: '檢視紀錄' },
      { key: 'update', label: '編輯紀錄' },
      { key: 'delete', label: '刪除紀錄' }
    ]
  },
  {
    key: 'hr',
    label: '人資管理',
    description: '管理考勤、休假與班表',
    actions: [
      { key: 'create', label: '新增資料' },
      { key: 'read', label: '檢視資料' },
      { key: 'update', label: '編輯資料' },
      { key: 'delete', label: '刪除資料' }
    ]
  },
  {
    key: 'reports',
    label: '營運報表',
    description: '查看營運統計報表',
    actions: [
      { key: 'read', label: '檢視報表' }
    ]
  },
  {
    key: 'settings',
    label: '系統設定',
    description: '管理系統設定與權限',
    actions: [
      { key: 'read', label: '檢視設定' },
      { key: 'update', label: '編輯設定' }
    ]
  }
]

/**
 * 建立空白權限配置
 */
export const createEmptyPermissions = (): Record<string, Record<PermissionAction, boolean>> => {
  const permissions: Record<string, Record<string, boolean>> = {}

  PERMISSION_MODULES.forEach(module => {
    permissions[module.key] = {}
    module.actions.forEach(action => {
      permissions[module.key][action.key] = false
    })
  })

  return permissions
}

/**
 * 建立完整權限配置（所有權限為 true）
 */
export const createFullPermissions = (): Record<string, Record<PermissionAction, boolean>> => {
  const permissions: Record<string, Record<string, boolean>> = {}

  PERMISSION_MODULES.forEach(module => {
    permissions[module.key] = {}
    module.actions.forEach(action => {
      permissions[module.key][action.key] = true
    })
  })

  return permissions
}
