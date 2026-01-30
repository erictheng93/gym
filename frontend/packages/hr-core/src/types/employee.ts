/**
 * HR 模組員工類型定義
 * 定義 HR 業務所需的最小員工接口
 */

/**
 * 員工雇用狀態
 */
export type EmploymentStatus = 'ACTIVE' | 'RESIGNED' | 'LEAVE'

/**
 * 員工雇用類型
 */
export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'FREELANCE'

/**
 * HR 模組員工最小接口
 * 只包含 HR 業務所需的字段
 */
export interface IEmployee {
  /** 員工 ID */
  id: string
  /** 員工編號 */
  employeeCode: string | null
  /** 員工姓名 */
  fullName: string
  /** 所屬分店 ID */
  branchId: string | null
  /** 職位 ID */
  jobTitleId: string | null
  /** 直屬主管 ID */
  supervisorId: string | null
  /** 雇用狀態 */
  employmentStatus: EmploymentStatus
  /** 雇用類型 */
  employmentType: EmploymentType
}

/**
 * 職位接口
 */
export interface IJobTitle {
  /** 職位 ID */
  id: string
  /** 職位名稱 */
  name: string
  /** 權限配置 */
  permissionsConfig: Record<string, boolean> | null
}

/**
 * 擴展員工接口（包含關聯）
 */
export interface IEmployeeWithRelations extends IEmployee {
  /** 職位資訊 */
  jobTitle?: IJobTitle
  /** 直屬主管資訊 */
  supervisor?: IEmployee
}
