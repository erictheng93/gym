import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateCsv,
  generateExcel,
  translateStatus,
  translatePaymentMethod,
  translatePaymentType,
  translateGender,
  payrollColumns,
  membersColumns,
  contractsColumns,
  paymentsColumns,
  revenueColumns,
  type ExportColumn,
} from '../src/services/export.js';

// =============================================================================
// EXPORT SERVICE UNIT TESTS
// =============================================================================

describe('Export Service', () => {
  // ---------------------------------------------------------------------------
  // CSV Generation Tests
  // ---------------------------------------------------------------------------
  describe('generateCsv', () => {
    it('should generate valid CSV with headers and data', () => {
      const columns: ExportColumn[] = [
        { header: '姓名', key: 'name' },
        { header: '年齡', key: 'age' },
      ];
      const data = [
        { name: '張三', age: 25 },
        { name: '李四', age: 30 },
      ];

      const result = generateCsv(columns, data);

      expect(result.success).toBe(true);
      expect(result.buffer).toBeDefined();

      const content = result.buffer!.toString('utf-8');
      // Check BOM is present
      expect(content.startsWith('\ufeff')).toBe(true);
      // Check headers
      expect(content).toContain('姓名,年齡');
      // Check data
      expect(content).toContain('張三,25');
      expect(content).toContain('李四,30');
    });

    it('should handle empty data', () => {
      const columns: ExportColumn[] = [
        { header: '姓名', key: 'name' },
      ];
      const data: Record<string, unknown>[] = [];

      const result = generateCsv(columns, data);

      expect(result.success).toBe(true);
      expect(result.buffer).toBeDefined();

      const content = result.buffer!.toString('utf-8');
      // Should only have header
      expect(content).toContain('姓名');
    });

    it('should escape fields containing commas', () => {
      const columns: ExportColumn[] = [
        { header: '地址', key: 'address' },
      ];
      const data = [
        { address: '台北市,信義區' },
      ];

      const result = generateCsv(columns, data);
      const content = result.buffer!.toString('utf-8');

      // Field with comma should be quoted
      expect(content).toContain('"台北市,信義區"');
    });

    it('should escape fields containing quotes', () => {
      const columns: ExportColumn[] = [
        { header: '備註', key: 'notes' },
      ];
      const data = [
        { notes: '他說"你好"' },
      ];

      const result = generateCsv(columns, data);
      const content = result.buffer!.toString('utf-8');

      // Quotes should be doubled and field quoted
      expect(content).toContain('"他說""你好"""');
    });

    it('should escape fields containing newlines', () => {
      const columns: ExportColumn[] = [
        { header: '備註', key: 'notes' },
      ];
      const data = [
        { notes: '第一行\n第二行' },
      ];

      const result = generateCsv(columns, data);
      const content = result.buffer!.toString('utf-8');

      // Field with newline should be quoted
      expect(content).toContain('"第一行\n第二行"');
    });

    it('should handle null and undefined values', () => {
      const columns: ExportColumn[] = [
        { header: '姓名', key: 'name' },
        { header: 'Email', key: 'email' },
      ];
      const data = [
        { name: '張三', email: null },
        { name: '李四', email: undefined },
      ];

      const result = generateCsv(columns, data);

      expect(result.success).toBe(true);
      const content = result.buffer!.toString('utf-8');
      // Null/undefined should become empty string
      expect(content).toContain('張三,');
    });

    it('should handle Date objects', () => {
      const columns: ExportColumn[] = [
        { header: '日期', key: 'date' },
      ];
      const date = new Date('2024-03-15T10:30:00Z');
      const data = [
        { date },
      ];

      const result = generateCsv(columns, data);
      const content = result.buffer!.toString('utf-8');

      // Date should be formatted as YYYY-MM-DD
      expect(content).toContain('2024-03-15');
    });

    it('should handle numeric values', () => {
      const columns: ExportColumn[] = [
        { header: '金額', key: 'amount' },
      ];
      const data = [
        { amount: 12345.67 },
      ];

      const result = generateCsv(columns, data);
      const content = result.buffer!.toString('utf-8');

      expect(content).toContain('12345.67');
    });
  });

  // ---------------------------------------------------------------------------
  // Excel Generation Tests
  // ---------------------------------------------------------------------------
  describe('generateExcel', () => {
    it('should generate valid Excel buffer', async () => {
      const columns: ExportColumn[] = [
        { header: '姓名', key: 'name', width: 15 },
        { header: '年齡', key: 'age', width: 10 },
      ];
      const data = [
        { name: '張三', age: 25 },
        { name: '李四', age: 30 },
      ];

      const result = await generateExcel(columns, data, '測試工作表');

      expect(result.success).toBe(true);
      expect(result.buffer).toBeDefined();
      expect(result.buffer!.length).toBeGreaterThan(0);

      // Excel files start with PK (ZIP signature)
      expect(result.buffer![0]).toBe(0x50); // 'P'
      expect(result.buffer![1]).toBe(0x4b); // 'K'
    });

    it('should handle empty data', async () => {
      const columns: ExportColumn[] = [
        { header: '姓名', key: 'name' },
      ];
      const data: Record<string, unknown>[] = [];

      const result = await generateExcel(columns, data);

      expect(result.success).toBe(true);
      expect(result.buffer).toBeDefined();
    });

    it('should use default sheet name', async () => {
      const columns: ExportColumn[] = [
        { header: '姓名', key: 'name' },
      ];
      const data = [{ name: '測試' }];

      const result = await generateExcel(columns, data);

      expect(result.success).toBe(true);
    });

    it('should handle special characters in data', async () => {
      const columns: ExportColumn[] = [
        { header: '特殊字元', key: 'special' },
      ];
      const data = [
        { special: '!@#$%^&*()' },
        { special: '中文字元' },
        { special: '日本語テスト' },
      ];

      const result = await generateExcel(columns, data, '特殊字元測試');

      expect(result.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Translation Helper Tests
  // ---------------------------------------------------------------------------
  describe('translateStatus', () => {
    it('should translate member statuses', () => {
      expect(translateStatus('ACTIVE')).toBe('有效');
      expect(translateStatus('EXPIRED')).toBe('已過期');
      expect(translateStatus('SUSPENDED')).toBe('已停權');
      expect(translateStatus('BANNED')).toBe('已封鎖');
    });

    it('should translate contract statuses', () => {
      expect(translateStatus('DRAFT')).toBe('草稿');
      expect(translateStatus('PAUSED')).toBe('暫停中');
      expect(translateStatus('CANCELLED')).toBe('已取消');
      expect(translateStatus('TRANSFERRED')).toBe('已轉讓');
    });

    it('should translate payroll statuses', () => {
      expect(translateStatus('PENDING')).toBe('待審核');
      expect(translateStatus('APPROVED')).toBe('已核准');
      expect(translateStatus('PAID')).toBe('已發放');
    });

    it('should translate payment statuses', () => {
      expect(translateStatus('UNPAID')).toBe('未付款');
      expect(translateStatus('PARTIAL')).toBe('部分付款');
    });

    it('should handle null and unknown values', () => {
      expect(translateStatus(null)).toBe('');
      expect(translateStatus('UNKNOWN_STATUS')).toBe('UNKNOWN_STATUS');
    });
  });

  describe('translatePaymentMethod', () => {
    it('should translate all payment methods', () => {
      expect(translatePaymentMethod('CASH')).toBe('現金');
      expect(translatePaymentMethod('CREDIT_CARD')).toBe('信用卡');
      expect(translatePaymentMethod('DEBIT_CARD')).toBe('金融卡');
      expect(translatePaymentMethod('BANK_TRANSFER')).toBe('銀行轉帳');
      expect(translatePaymentMethod('LINE_PAY')).toBe('LINE Pay');
      expect(translatePaymentMethod('OTHER')).toBe('其他');
    });

    it('should handle null and unknown values', () => {
      expect(translatePaymentMethod(null)).toBe('');
      expect(translatePaymentMethod('CRYPTO')).toBe('CRYPTO');
    });
  });

  describe('translatePaymentType', () => {
    it('should translate payment types', () => {
      expect(translatePaymentType('INCOME')).toBe('收入');
      expect(translatePaymentType('REFUND')).toBe('退款');
    });

    it('should handle null and unknown values', () => {
      expect(translatePaymentType(null)).toBe('');
      expect(translatePaymentType('UNKNOWN')).toBe('UNKNOWN');
    });
  });

  describe('translateGender', () => {
    it('should translate genders', () => {
      expect(translateGender('MALE')).toBe('男');
      expect(translateGender('FEMALE')).toBe('女');
      expect(translateGender('OTHER')).toBe('其他');
    });

    it('should handle null and unknown values', () => {
      expect(translateGender(null)).toBe('');
      expect(translateGender('UNKNOWN')).toBe('UNKNOWN');
    });
  });

  // ---------------------------------------------------------------------------
  // Column Definition Tests
  // ---------------------------------------------------------------------------
  describe('Column Definitions', () => {
    it('should have valid payroll columns', () => {
      expect(payrollColumns.length).toBeGreaterThan(0);
      expect(payrollColumns.every(col => col.header && col.key)).toBe(true);
      expect(payrollColumns.some(col => col.key === 'employeeCode')).toBe(true);
      expect(payrollColumns.some(col => col.key === 'netSalary')).toBe(true);
    });

    it('should have valid members columns', () => {
      expect(membersColumns.length).toBeGreaterThan(0);
      expect(membersColumns.every(col => col.header && col.key)).toBe(true);
      expect(membersColumns.some(col => col.key === 'memberCode')).toBe(true);
      expect(membersColumns.some(col => col.key === 'fullName')).toBe(true);
    });

    it('should have valid contracts columns', () => {
      expect(contractsColumns.length).toBeGreaterThan(0);
      expect(contractsColumns.every(col => col.header && col.key)).toBe(true);
      expect(contractsColumns.some(col => col.key === 'contractNo')).toBe(true);
      expect(contractsColumns.some(col => col.key === 'status')).toBe(true);
    });

    it('should have valid payments columns', () => {
      expect(paymentsColumns.length).toBeGreaterThan(0);
      expect(paymentsColumns.every(col => col.header && col.key)).toBe(true);
      expect(paymentsColumns.some(col => col.key === 'receiptNo')).toBe(true);
      expect(paymentsColumns.some(col => col.key === 'amount')).toBe(true);
    });

    it('should have valid revenue columns', () => {
      expect(revenueColumns.length).toBeGreaterThan(0);
      expect(revenueColumns.every(col => col.header && col.key)).toBe(true);
      expect(revenueColumns.some(col => col.key === 'date')).toBe(true);
      expect(revenueColumns.some(col => col.key === 'total')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Integration-like Tests
  // ---------------------------------------------------------------------------
  describe('Real-world Scenarios', () => {
    it('should export payroll data correctly', async () => {
      const data = [
        {
          employeeCode: 'E001',
          employeeName: '王小明',
          jobTitle: '健身教練',
          branchName: '台北總店',
          period: '2024-03',
          baseSalary: 35000,
          overtimeHours: 10,
          overtimePay: 2500,
          commission: 5000,
          bonus: 3000,
          deductions: 1500,
          netSalary: 44000,
          status: '已發放',
        },
      ];

      const csvResult = generateCsv(payrollColumns, data);
      expect(csvResult.success).toBe(true);

      const excelResult = await generateExcel(payrollColumns, data, '薪資記錄');
      expect(excelResult.success).toBe(true);
    });

    it('should export member list correctly', async () => {
      const data = [
        {
          memberCode: 'M000001',
          fullName: '陳大文',
          phone: '0912345678',
          email: 'test@example.com',
          gender: '男',
          status: '有效',
          joinDate: '2024-01-15',
          branchName: '台北總店',
        },
      ];

      const csvResult = generateCsv(membersColumns, data);
      expect(csvResult.success).toBe(true);

      const excelResult = await generateExcel(membersColumns, data, '會員列表');
      expect(excelResult.success).toBe(true);
    });

    it('should handle large datasets', async () => {
      const columns: ExportColumn[] = [
        { header: 'ID', key: 'id' },
        { header: '名稱', key: 'name' },
        { header: '金額', key: 'amount' },
      ];

      // Generate 1000 rows
      const data = Array.from({ length: 1000 }, (_, i) => ({
        id: i + 1,
        name: `測試項目 ${i + 1}`,
        amount: Math.random() * 10000,
      }));

      const csvResult = generateCsv(columns, data);
      expect(csvResult.success).toBe(true);
      expect(csvResult.buffer!.length).toBeGreaterThan(0);

      const excelResult = await generateExcel(columns, data, '大量資料');
      expect(excelResult.success).toBe(true);
    });
  });
});
