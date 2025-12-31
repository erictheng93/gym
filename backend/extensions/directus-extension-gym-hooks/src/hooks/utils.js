/**
 * Shared Utilities for Hooks
 */

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
 * 計算工時 (小時)
 */
export function calculateWorkHours(checkIn, checkOut, breakMinutes = 60) {
  if (!checkIn || !checkOut) return 0;

  const inTime = new Date(checkIn);
  const outTime = new Date(checkOut);
  const diffMs = outTime - inTime;
  const diffHours = diffMs / (1000 * 60 * 60);

  // 扣除休息時間
  const workHours = diffHours - (breakMinutes / 60);
  return Math.max(0, Math.round(workHours * 100) / 100);
}

/**
 * 計算遲到分鐘數
 */
export function calculateLateMinutes(checkIn, scheduledStart, graceMinutes = 10) {
  if (!checkIn || !scheduledStart) return 0;

  const inTime = new Date(checkIn);
  const scheduled = new Date(scheduledStart);
  const diffMs = inTime - scheduled;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  // 寬限時間內不算遲到
  if (diffMinutes <= graceMinutes) return 0;
  return diffMinutes - graceMinutes;
}

/**
 * 計算請假天數 (支援半天假)
 */
export function calculateLeaveDays(startDate, endDate, isHalfDay) {
  if (isHalfDay) return 0.5;

  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return diffDays;
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
