// =============================================================================
// EXPORT SERVICE
// =============================================================================
// Generates CSV and Excel files for data export

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ExportColumn {
  header: string;    // Display name (e.g., Chinese label)
  key: string;       // Data key
  width?: number;    // Column width (default: 15)
}

export interface ExportResult {
  success: boolean;
  buffer?: Buffer;
  error?: string;
}

// -----------------------------------------------------------------------------
// Excel Generation
// -----------------------------------------------------------------------------

/**
 * Generate Excel file from data
 */
export async function generateExcel(
  columns: ExportColumn[],
  data: Record<string, unknown>[],
  sheetName: string = 'Sheet1'
): Promise<ExportResult> {
  try {
    // Dynamic import to avoid build-time dependency issues
    const ExcelJS = await import('exceljs');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Gym Nexus';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet(sheetName);

    // Set up columns
    worksheet.columns = columns.map(col => ({
      header: col.header,
      key: col.key,
      width: col.width || 15,
    }));

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF10B981' }, // Green color matching the app theme
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Add data rows
    for (const row of data) {
      const rowData: Record<string, unknown> = {};
      for (const col of columns) {
        rowData[col.key] = formatCellValue(row[col.key]);
      }
      worksheet.addRow(rowData);
    }

    // Auto-filter
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    return { success: true, buffer: Buffer.from(buffer) };

  } catch (error) {
    console.error('[ExportService] Excel generation error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// -----------------------------------------------------------------------------
// CSV Generation
// -----------------------------------------------------------------------------

/**
 * Generate CSV file from data
 */
export function generateCsv(
  columns: ExportColumn[],
  data: Record<string, unknown>[]
): ExportResult {
  try {
    const rows: string[] = [];

    // Header row
    rows.push(columns.map(col => escapeCSVField(col.header)).join(','));

    // Data rows
    for (const row of data) {
      const values = columns.map(col => {
        const value = formatCellValue(row[col.key]);
        return escapeCSVField(String(value ?? ''));
      });
      rows.push(values.join(','));
    }

    // Add BOM for UTF-8 encoding (helps with Excel opening)
    const csvContent = '\ufeff' + rows.join('\r\n');
    const buffer = Buffer.from(csvContent, 'utf-8');

    return { success: true, buffer };

  } catch (error) {
    console.error('[ExportService] CSV generation error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

/**
 * Escape CSV field value
 */
function escapeCSVField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Format cell value for export
 */
function formatCellValue(value: unknown): string | number | null {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    return value;
  }
  return String(value);
}

// -----------------------------------------------------------------------------
// Column Definitions
// -----------------------------------------------------------------------------

/**
 * Payroll export columns
 */
export const payrollColumns: ExportColumn[] = [
  { header: '員工編號', key: 'employeeCode', width: 12 },
  { header: '員工姓名', key: 'employeeName', width: 15 },
  { header: '職稱', key: 'jobTitle', width: 15 },
  { header: '分店', key: 'branchName', width: 15 },
  { header: '薪資期間', key: 'period', width: 12 },
  { header: '底薪', key: 'baseSalary', width: 12 },
  { header: '加班時數', key: 'overtimeHours', width: 10 },
  { header: '加班費', key: 'overtimePay', width: 12 },
  { header: '業績獎金', key: 'commission', width: 12 },
  { header: '獎金', key: 'bonus', width: 12 },
  { header: '扣款', key: 'deductions', width: 12 },
  { header: '實發薪資', key: 'netSalary', width: 12 },
  { header: '狀態', key: 'status', width: 10 },
];

/**
 * Revenue report export columns
 */
export const revenueColumns: ExportColumn[] = [
  { header: '日期', key: 'date', width: 12 },
  { header: '分店名稱', key: 'branchName', width: 15 },
  { header: '總收入', key: 'total', width: 12 },
];

/**
 * Member growth export columns
 */
export const memberGrowthColumns: ExportColumn[] = [
  { header: '月份', key: 'month', width: 12 },
  { header: '新增會員數', key: 'count', width: 12 },
];

/**
 * Contract expiry export columns
 */
export const contractExpiryColumns: ExportColumn[] = [
  { header: '合約編號', key: 'contractNo', width: 15 },
  { header: '會員姓名', key: 'memberName', width: 15 },
  { header: '會員編號', key: 'memberCode', width: 12 },
  { header: '聯絡電話', key: 'memberPhone', width: 15 },
  { header: '分店', key: 'branchName', width: 15 },
  { header: '到期日', key: 'endDate', width: 12 },
  { header: '剩餘天數', key: 'daysUntilExpiry', width: 10 },
  { header: '合約狀態', key: 'status', width: 12 },
];

/**
 * Member activity export columns
 */
export const memberActivityColumns: ExportColumn[] = [
  { header: '日期', key: 'date', width: 12 },
  { header: '入場次數', key: 'count', width: 12 },
];

/**
 * Members list export columns
 */
export const membersColumns: ExportColumn[] = [
  { header: '會員編號', key: 'memberCode', width: 12 },
  { header: '會員姓名', key: 'fullName', width: 15 },
  { header: '電話', key: 'phone', width: 15 },
  { header: 'Email', key: 'email', width: 25 },
  { header: '性別', key: 'gender', width: 8 },
  { header: '狀態', key: 'status', width: 10 },
  { header: '加入日期', key: 'joinDate', width: 12 },
  { header: '分店', key: 'branchName', width: 15 },
];

/**
 * Contracts list export columns
 */
export const contractsColumns: ExportColumn[] = [
  { header: '合約編號', key: 'contractNo', width: 15 },
  { header: '會員姓名', key: 'memberName', width: 15 },
  { header: '會員編號', key: 'memberCode', width: 12 },
  { header: '方案名稱', key: 'planName', width: 20 },
  { header: '合約狀態', key: 'status', width: 12 },
  { header: '開始日期', key: 'startDate', width: 12 },
  { header: '結束日期', key: 'endDate', width: 12 },
  { header: '合約金額', key: 'totalAmount', width: 12 },
  { header: '付款狀態', key: 'paymentStatus', width: 12 },
];

/**
 * Payments list export columns
 */
export const paymentsColumns: ExportColumn[] = [
  { header: '收據編號', key: 'receiptNo', width: 15 },
  { header: '會員姓名', key: 'memberName', width: 15 },
  { header: '會員編號', key: 'memberCode', width: 12 },
  { header: '金額', key: 'amount', width: 12 },
  { header: '付款方式', key: 'paymentMethod', width: 12 },
  { header: '付款日期', key: 'paymentDate', width: 12 },
  { header: '類型', key: 'type', width: 10 },
];

// -----------------------------------------------------------------------------
// Translation Helpers
// -----------------------------------------------------------------------------

/**
 * Translate status to Chinese
 */
export function translateStatus(status: string | null): string {
  const statusMap: Record<string, string> = {
    ACTIVE: '有效',
    EXPIRED: '已過期',
    SUSPENDED: '已停權',
    BANNED: '已封鎖',
    DRAFT: '草稿',
    PAUSED: '暫停中',
    CANCELLED: '已取消',
    TRANSFERRED: '已轉讓',
    PENDING: '待審核',
    APPROVED: '已核准',
    PAID: '已發放',
    UNPAID: '未付款',
    PARTIAL: '部分付款',
  };
  return statusMap[status || ''] || status || '';
}

/**
 * Translate payment method to Chinese
 */
export function translatePaymentMethod(method: string | null): string {
  const methodMap: Record<string, string> = {
    CASH: '現金',
    CREDIT_CARD: '信用卡',
    DEBIT_CARD: '金融卡',
    BANK_TRANSFER: '銀行轉帳',
    LINE_PAY: 'LINE Pay',
    OTHER: '其他',
  };
  return methodMap[method || ''] || method || '';
}

/**
 * Translate payment type to Chinese
 */
export function translatePaymentType(type: string | null): string {
  const typeMap: Record<string, string> = {
    INCOME: '收入',
    REFUND: '退款',
  };
  return typeMap[type || ''] || type || '';
}

/**
 * Translate gender to Chinese
 */
export function translateGender(gender: string | null): string {
  const genderMap: Record<string, string> = {
    MALE: '男',
    FEMALE: '女',
    OTHER: '其他',
  };
  return genderMap[gender || ''] || gender || '';
}

// -----------------------------------------------------------------------------
// Export
// -----------------------------------------------------------------------------

export const exportService = {
  generateExcel,
  generateCsv,
  payrollColumns,
  revenueColumns,
  memberGrowthColumns,
  contractExpiryColumns,
  memberActivityColumns,
  membersColumns,
  contractsColumns,
  paymentsColumns,
  translateStatus,
  translatePaymentMethod,
  translatePaymentType,
  translateGender,
};

export default exportService;
