/**
 * 員工實體映射器
 * Directus Employee ↔ HR IEmployee
 */

import type { IEmployee, IJobTitle, IEmployeeWithRelations } from '@gym-nexus/hr-core'

/**
 * Directus 員工類型（來自數據庫）
 */
export interface DirectusEmployee {
  id: string
  employee_code: string | null
  full_name: string
  branch_id: string | null
  job_title_id: string | null
  supervisor_id?: string | null
  employment_status: 'ACTIVE' | 'RESIGNED' | 'LEAVE'
  employment_type: 'FULL_TIME' | 'PART_TIME' | 'FREELANCE'
  status?: 'active' | 'archived'
  // 關聯
  job_title?: DirectusJobTitle | null
  supervisor?: DirectusEmployee | null
}

/**
 * Directus 職位類型
 */
export interface DirectusJobTitle {
  id: string
  name: string
  permissions_config: Record<string, boolean> | null
  status?: string
}

/**
 * 將 Directus 員工轉換為 HR IEmployee
 */
export function mapDirectusEmployeeToIEmployee(directus: DirectusEmployee): IEmployee {
  return {
    id: directus.id,
    employeeCode: directus.employee_code,
    fullName: directus.full_name,
    branchId: directus.branch_id,
    jobTitleId: directus.job_title_id,
    supervisorId: directus.supervisor_id ?? null,
    employmentStatus: directus.employment_status,
    employmentType: directus.employment_type
  }
}

/**
 * 將 Directus 職位轉換為 HR IJobTitle
 */
export function mapDirectusJobTitleToIJobTitle(directus: DirectusJobTitle): IJobTitle {
  return {
    id: directus.id,
    name: directus.name,
    permissionsConfig: directus.permissions_config
  }
}

/**
 * 將 Directus 員工轉換為 HR IEmployeeWithRelations
 */
export function mapDirectusEmployeeToIEmployeeWithRelations(
  directus: DirectusEmployee
): IEmployeeWithRelations {
  const base = mapDirectusEmployeeToIEmployee(directus)

  return {
    ...base,
    jobTitle: directus.job_title ? mapDirectusJobTitleToIJobTitle(directus.job_title) : undefined,
    supervisor: directus.supervisor
      ? mapDirectusEmployeeToIEmployee(directus.supervisor)
      : undefined
  }
}

/**
 * 將 HR IEmployee 轉換為 Directus 格式（用於創建/更新）
 */
export function mapIEmployeeToDirectus(employee: Partial<IEmployee>): Partial<DirectusEmployee> {
  const result: Partial<DirectusEmployee> = {}

  if (employee.employeeCode !== undefined) result.employee_code = employee.employeeCode
  if (employee.fullName !== undefined) result.full_name = employee.fullName
  if (employee.branchId !== undefined) result.branch_id = employee.branchId
  if (employee.jobTitleId !== undefined) result.job_title_id = employee.jobTitleId
  if (employee.supervisorId !== undefined) result.supervisor_id = employee.supervisorId
  if (employee.employmentStatus !== undefined) result.employment_status = employee.employmentStatus
  if (employee.employmentType !== undefined) result.employment_type = employee.employmentType

  return result
}
