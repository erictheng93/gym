/**
 * Shared Utilities for Hooks
 *
 * 這些函數從 @gym-nexus/hr-business-logic 重新導出
 * 以保持現有代碼的向後兼容性
 */

// 重新導出 HR 業務邏輯包的計算函數
export {
  // Work Hours
  calculateWorkHours,
  calculateOvertimeHours,
  // Late Minutes
  calculateLateMinutes,
  calculateEarlyLeaveMinutes,
  // Leave Balance
  calculateLeaveDays,
  calculateAvailableDays,
  hasEnoughBalance,
  getLeaveTypeName
} from '@gym-nexus/hr-business-logic';

// ============================================
// 非 HR 相關的工具函數（保留在此處）
// ============================================

/**
 * 根據會員的所有合約計算會員狀態
 * 優先順序：ACTIVE > PAUSED > INACTIVE
 */
export function calculateMemberStatus(contracts) {
  if (!contracts || contracts.length === 0) {
    return 'INACTIVE';
  }

  const hasActive = contracts.some(c => c.contract_status === 'ACTIVE');
  const hasPaused = contracts.some(c => c.contract_status === 'PAUSED');

  if (hasActive) return 'ACTIVE';
  if (hasPaused) return 'PAUSED';
  return 'INACTIVE';
}

/**
 * 計算合約付款狀態
 * @param {number} totalAmount - 合約總金額
 * @param {number} paidAmount - 已付金額
 * @returns {string} 付款狀態: UNPAID | PARTIAL | PAID
 */
export function calculatePaymentStatus(totalAmount, paidAmount) {
  if (!totalAmount || totalAmount <= 0) return 'PAID';
  if (!paidAmount || paidAmount <= 0) return 'UNPAID';
  if (paidAmount >= totalAmount) return 'PAID';
  return 'PARTIAL';
}

/**
 * 產生唯一的會員編號
 * 格式: MYYMMDD#### (例如: M2506150001)
 */
export async function generateMemberCode(membersService) {
  const prefix = 'M';
  const today = new Date();
  const dateStr = today.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD

  // 取得今天建立的會員數量
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  try {
    const todayMembers = await membersService.readByQuery({
      filter: {
        date_created: {
          _between: [startOfDay.toISOString(), endOfDay.toISOString()],
        },
      },
      aggregate: { count: ['id'] },
    });

    const count = todayMembers[0]?.count?.id || 0;
    const sequence = (parseInt(count) + 1).toString().padStart(4, '0');
    return `${prefix}${dateStr}${sequence}`;
  } catch (error) {
    // 如果查詢失敗，使用時間戳作為備用
    const timestamp = Date.now().toString().slice(-6);
    return `${prefix}${dateStr}${timestamp}`;
  }
}

/**
 * 輔助函數：取得操作名稱
 */
export function getActionName(action) {
  const actionNames = {
    create: '新增',
    read: '檢視',
    update: '編輯',
    delete: '刪除',
  };
  return actionNames[action] || action;
}

/**
 * 輔助函數：取得模組名稱
 */
export function getModuleName(module) {
  const moduleNames = {
    members: '會員',
    contracts: '合約',
    payments: '付款紀錄',
    plans: '會籍方案',
    employees: '員工',
    branches: '分店',
    checkin: '入場紀錄',
    hr: '人資資料',
    reports: '報表',
    settings: '系統設定',
  };
  return moduleNames[module] || module;
}
