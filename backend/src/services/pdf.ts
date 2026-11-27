// Note: Run `pnpm add puppeteer` to install PDF generation dependencies
import { db, contracts, members, membershipPlans, branches, payments } from '../db/index.js';
import { and, eq } from 'drizzle-orm';
import { escapeHtml } from '../utils/html.js';
import { fileService } from './files.js';
export { escapeHtml };

// Browser instance for PDF generation (puppeteer)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Browser = any;

// =============================================================================
// PDF GENERATION SERVICE
// =============================================================================
// Generates PDFs for contracts, invoices, and receipts using Puppeteer

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface PdfGenerationResult {
  success: boolean;
  buffer?: Buffer;
  error?: string;
  notFound?: boolean;
}

export interface ContractData {
  contractNo: string;
  memberName: string;
  memberCode: string;
  memberPhone: string;
  memberEmail?: string;
  planName: string;
  planType: string;
  startDate: string;
  endDate: string;
  totalAmount: number;
  branchName: string;
  branchAddress?: string;
  createdAt: string;
  /** The member's signature PNG as a data: URI (the renderer only loads data:/about: URLs) */
  signatureDataUri?: string;
}

interface InvoiceData {
  invoiceNo: string;
  memberName: string;
  memberCode: string;
  amount: number;
  paymentMethod: string;
  paymentDate: string;
  description: string;
  branchName: string;
  branchAddress?: string;
  branchTaxId?: string;
}

// -----------------------------------------------------------------------------
// Module State
// -----------------------------------------------------------------------------

let browser: Browser | null = null;

// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------

/**
 * Get or create browser instance
 */
async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.connected) {
    // Dynamic import to avoid build-time dependency
    const puppeteer = await (Function('return import("puppeteer")')() as Promise<{ default: { launch: (opts: unknown) => Promise<Browser> } }>);
    browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browser;
}

/**
 * Cleanup browser instance
 */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

const PDF_CONTRACT_SELECT = {
  contractNo: contracts.contractNo,
  startDate: contracts.startDate,
  endDate: contracts.endDate,
  totalAmount: contracts.totalAmount,
  createdAt: contracts.createdAt,
  memberId: contracts.memberId,
  planId: contracts.planId,
  branchId: contracts.branchId,
  digitalSignature: contracts.digitalSignature,
};

const PDF_CONTRACT_MEMBER_SELECT = {
  fullName: members.fullName,
  memberCode: members.memberCode,
  phone: members.phone,
  email: members.email,
};

const PDF_CONTRACT_PLAN_SELECT = {
  name: membershipPlans.name,
  planType: membershipPlans.planType,
};

const PDF_CONTRACT_BRANCH_SELECT = {
  name: branches.name,
  address: branches.address,
};

const PDF_PAYMENT_SELECT = {
  id: payments.id,
  amount: payments.amount,
  paymentMethod: payments.paymentMethod,
  paymentDate: payments.paymentDate,
  receiptNo: payments.receiptNo,
  notes: payments.notes,
  memberId: payments.memberId,
  branchId: payments.branchId,
};

const PDF_INVOICE_MEMBER_SELECT = {
  fullName: members.fullName,
  memberCode: members.memberCode,
};

const PDF_INVOICE_BRANCH_SELECT = {
  name: branches.name,
  address: branches.address,
  taxId: branches.taxId,
};

// -----------------------------------------------------------------------------
// Contract PDF
// -----------------------------------------------------------------------------

/**
 * Generate contract PDF
 */
export async function generateContractPdf(contractId: string, tenantId: string): Promise<PdfGenerationResult> {
  try {
    // Fetch contract data
    const [contract] = await db
      .select(PDF_CONTRACT_SELECT)
      .from(contracts)
      .where(and(eq(contracts.id, contractId), eq(contracts.tenantId, tenantId)))
      .limit(1);

    if (!contract) {
      return { success: false, error: 'Contract not found', notFound: true };
    }

    // Fetch related data in parallel
    const [[member], [plan], [branch], signature] = await Promise.all([
      db
        .select(PDF_CONTRACT_MEMBER_SELECT)
        .from(members)
        .where(and(eq(members.id, contract.memberId), eq(members.tenantId, tenantId)))
        .limit(1),
      db
        .select(PDF_CONTRACT_PLAN_SELECT)
        .from(membershipPlans)
        .where(and(eq(membershipPlans.id, contract.planId), eq(membershipPlans.tenantId, tenantId)))
        .limit(1),
      db
        .select(PDF_CONTRACT_BRANCH_SELECT)
        .from(branches)
        .where(and(eq(branches.id, contract.branchId), eq(branches.tenantId, tenantId)))
        .limit(1),
      contract.digitalSignature ? fileService.getContent(contract.digitalSignature, tenantId) : null,
    ]);

    const contractData: ContractData = {
      contractNo: contract.contractNo,
      memberName: member?.fullName || 'Unknown',
      memberCode: member?.memberCode || '',
      memberPhone: member?.phone || '',
      memberEmail: member?.email || undefined,
      planName: plan?.name || 'Unknown Plan',
      planType: plan?.planType || 'TIME_BASED',
      startDate: contract.startDate,
      endDate: contract.endDate,
      totalAmount: parseFloat(contract.totalAmount),
      branchName: branch?.name || 'Unknown Branch',
      branchAddress: branch?.address || undefined,
      createdAt: contract.createdAt?.toISOString() || new Date().toISOString(),
      signatureDataUri: signature?.mimeType === 'image/png'
        ? `data:image/png;base64,${signature.data.toString('base64')}`
        : undefined,
    };

    // Generate HTML
    const html = generateContractHtml(contractData);

    // Generate PDF
    const buffer = await generatePdfFromHtml(html);

    return { success: true, buffer };

  } catch (error) {
    console.error('[PDFService] Contract PDF error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export function generateContractHtml(data: ContractData): string {
  const planTypeText = data.planType === 'TIME_BASED' ? '期限制' : '堂數制';

  return `
    <!DOCTYPE html>
    <html lang="zh-TW">
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: 'Microsoft JhengHei', 'PingFang TC', sans-serif;
          padding: 40px;
          max-width: 800px;
          margin: 0 auto;
          color: #333;
        }
        .header {
          text-align: center;
          margin-bottom: 40px;
          border-bottom: 2px solid #10b981;
          padding-bottom: 20px;
        }
        .header h1 {
          color: #10b981;
          margin: 0 0 10px 0;
          font-size: 28px;
        }
        .header .subtitle {
          color: #666;
          font-size: 14px;
        }
        .contract-no {
          text-align: right;
          font-size: 14px;
          color: #666;
          margin-bottom: 30px;
        }
        .section {
          margin-bottom: 30px;
        }
        .section-title {
          font-size: 18px;
          font-weight: bold;
          color: #10b981;
          margin-bottom: 15px;
          border-bottom: 1px solid #eee;
          padding-bottom: 5px;
        }
        .info-row {
          display: flex;
          margin-bottom: 10px;
          font-size: 14px;
        }
        .info-label {
          width: 120px;
          color: #666;
          flex-shrink: 0;
        }
        .info-value {
          flex: 1;
        }
        .total-amount {
          font-size: 24px;
          font-weight: bold;
          color: #10b981;
          text-align: right;
          margin-top: 20px;
          padding-top: 10px;
          border-top: 2px solid #eee;
        }
        .terms {
          font-size: 12px;
          color: #666;
          line-height: 1.6;
          margin-top: 40px;
          padding: 20px;
          background: #f9f9f9;
          border-radius: 8px;
        }
        .signature {
          margin-top: 60px;
          display: flex;
          justify-content: space-between;
        }
        .signature-box {
          width: 45%;
          text-align: center;
        }
        .signature-image {
          display: block;
          max-width: 100%;
          height: 60px;
          margin: 0 auto -60px;
          object-fit: contain;
        }
        .signature-line {
          border-top: 1px solid #333;
          margin-top: 60px;
          padding-top: 10px;
          font-size: 14px;
        }
        .footer {
          margin-top: 40px;
          text-align: center;
          font-size: 12px;
          color: #999;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>會員合約書</h1>
        <div class="subtitle">Gym Nexus 健身房管理系統</div>
      </div>

      <div class="contract-no">
        合約編號：${escapeHtml(data.contractNo)}
      </div>

      <div class="section">
        <div class="section-title">會員資料</div>
        <div class="info-row">
          <span class="info-label">會員姓名：</span>
          <span class="info-value">${escapeHtml(data.memberName)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">會員編號：</span>
          <span class="info-value">${escapeHtml(data.memberCode)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">聯絡電話：</span>
          <span class="info-value">${escapeHtml(data.memberPhone)}</span>
        </div>
        ${data.memberEmail ? `
        <div class="info-row">
          <span class="info-label">電子郵件：</span>
          <span class="info-value">${escapeHtml(data.memberEmail)}</span>
        </div>
        ` : ''}
      </div>

      <div class="section">
        <div class="section-title">合約內容</div>
        <div class="info-row">
          <span class="info-label">方案名稱：</span>
          <span class="info-value">${escapeHtml(data.planName)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">方案類型：</span>
          <span class="info-value">${escapeHtml(planTypeText)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">合約期間：</span>
          <span class="info-value">${escapeHtml(data.startDate)} 至 ${escapeHtml(data.endDate)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">簽約分店：</span>
          <span class="info-value">${escapeHtml(data.branchName)}</span>
        </div>
        ${data.branchAddress ? `
        <div class="info-row">
          <span class="info-label">分店地址：</span>
          <span class="info-value">${escapeHtml(data.branchAddress)}</span>
        </div>
        ` : ''}
      </div>

      <div class="total-amount">
        合約金額：NT$ ${data.totalAmount.toLocaleString()}
      </div>

      <div class="terms">
        <strong>合約條款：</strong><br><br>
        1. 本合約自簽約日起生效，會員應遵守本健身房各項規定。<br>
        2. 會員入場時需出示有效會員證或使用會員APP進行身份驗證。<br>
        3. 會員應妥善保管個人物品，本健身房不負保管責任。<br>
        4. 會員如有特殊健康狀況，應於運動前告知教練。<br>
        5. 合約期間內，會員得依規定申請暫停或轉讓會籍。<br>
        6. 本合約未盡事宜，依本健身房公告規定辦理。
      </div>

      <div class="signature">
        <div class="signature-box">
          ${data.signatureDataUri ? `<img class="signature-image" src="${escapeHtml(data.signatureDataUri)}" alt="會員簽名">` : ''}
          <div class="signature-line">會員簽名</div>
        </div>
        <div class="signature-box">
          <div class="signature-line">健身房代表</div>
        </div>
      </div>

      <div class="footer">
        合約生成日期：${new Date(data.createdAt).toLocaleDateString('zh-TW')}
      </div>
    </body>
    </html>
  `;
}

// -----------------------------------------------------------------------------
// Invoice PDF
// -----------------------------------------------------------------------------

/**
 * Generate invoice PDF for a payment
 */
export async function generateInvoicePdf(paymentId: string, tenantId: string): Promise<PdfGenerationResult> {
  try {
    // Fetch payment data
    const [payment] = await db
      .select(PDF_PAYMENT_SELECT)
      .from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.tenantId, tenantId)))
      .limit(1);

    if (!payment) {
      return { success: false, error: 'Payment not found', notFound: true };
    }

    // Fetch related data in parallel
    const [[member], [branch]] = await Promise.all([
      db
        .select(PDF_INVOICE_MEMBER_SELECT)
        .from(members)
        .where(and(eq(members.id, payment.memberId), eq(members.tenantId, tenantId)))
        .limit(1),
      db
        .select(PDF_INVOICE_BRANCH_SELECT)
        .from(branches)
        .where(and(eq(branches.id, payment.branchId), eq(branches.tenantId, tenantId)))
        .limit(1),
    ]);

    const invoiceData: InvoiceData = {
      invoiceNo: payment.receiptNo || `INV-${payment.id.substring(0, 8).toUpperCase()}`,
      memberName: member?.fullName || 'Unknown',
      memberCode: member?.memberCode || '',
      amount: parseFloat(payment.amount),
      paymentMethod: formatPaymentMethod(payment.paymentMethod),
      paymentDate: payment.paymentDate.toISOString().slice(0, 10),
      description: payment.notes || '健身房費用',
      branchName: branch?.name || 'Unknown Branch',
      branchAddress: branch?.address || undefined,
      branchTaxId: branch?.taxId || undefined,
    };

    // Generate HTML
    const html = generateInvoiceHtml(invoiceData);

    // Generate PDF
    const buffer = await generatePdfFromHtml(html);

    return { success: true, buffer };

  } catch (error) {
    console.error('[PDFService] Invoice PDF error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

function generateInvoiceHtml(data: InvoiceData): string {
  return `
    <!DOCTYPE html>
    <html lang="zh-TW">
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: 'Microsoft JhengHei', 'PingFang TC', sans-serif;
          padding: 40px;
          max-width: 800px;
          margin: 0 auto;
          color: #333;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 40px;
          border-bottom: 3px solid #6366f1;
          padding-bottom: 20px;
        }
        .company-info h1 {
          color: #6366f1;
          margin: 0 0 10px 0;
          font-size: 24px;
        }
        .company-info p {
          margin: 5px 0;
          font-size: 12px;
          color: #666;
        }
        .invoice-info {
          text-align: right;
        }
        .invoice-info h2 {
          color: #6366f1;
          margin: 0 0 10px 0;
          font-size: 28px;
        }
        .invoice-info p {
          margin: 5px 0;
          font-size: 14px;
        }
        .client-info {
          margin-bottom: 30px;
          padding: 20px;
          background: #f5f5f5;
          border-radius: 8px;
        }
        .client-info h3 {
          margin: 0 0 15px 0;
          font-size: 16px;
          color: #6366f1;
        }
        .client-info p {
          margin: 5px 0;
          font-size: 14px;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        .items-table th {
          background: #6366f1;
          color: white;
          padding: 12px;
          text-align: left;
          font-size: 14px;
        }
        .items-table td {
          padding: 12px;
          border-bottom: 1px solid #eee;
          font-size: 14px;
        }
        .items-table .amount {
          text-align: right;
        }
        .total-section {
          text-align: right;
          margin-top: 20px;
        }
        .total-row {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 10px;
          font-size: 14px;
        }
        .total-label {
          width: 120px;
          text-align: right;
          margin-right: 20px;
        }
        .total-value {
          width: 150px;
          text-align: right;
        }
        .grand-total {
          font-size: 24px;
          font-weight: bold;
          color: #6366f1;
          border-top: 2px solid #6366f1;
          padding-top: 15px;
          margin-top: 15px;
        }
        .payment-info {
          margin-top: 30px;
          padding: 20px;
          background: #f0fdf4;
          border-radius: 8px;
          border-left: 4px solid #10b981;
        }
        .payment-info h3 {
          margin: 0 0 10px 0;
          font-size: 16px;
          color: #10b981;
        }
        .payment-info p {
          margin: 5px 0;
          font-size: 14px;
        }
        .footer {
          margin-top: 40px;
          text-align: center;
          font-size: 12px;
          color: #999;
          border-top: 1px solid #eee;
          padding-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="company-info">
          <h1>Gym Nexus</h1>
          <p>${escapeHtml(data.branchName)}</p>
          ${data.branchAddress ? `<p>${escapeHtml(data.branchAddress)}</p>` : ''}
          ${data.branchTaxId ? `<p>統一編號：${escapeHtml(data.branchTaxId)}</p>` : ''}
        </div>
        <div class="invoice-info">
          <h2>收據</h2>
          <p><strong>單號：</strong>${escapeHtml(data.invoiceNo)}</p>
          <p><strong>日期：</strong>${escapeHtml(data.paymentDate)}</p>
        </div>
      </div>

      <div class="client-info">
        <h3>會員資料</h3>
        <p><strong>姓名：</strong>${escapeHtml(data.memberName)}</p>
        <p><strong>會員編號：</strong>${escapeHtml(data.memberCode)}</p>
      </div>

      <table class="items-table">
        <thead>
          <tr>
            <th>項目說明</th>
            <th class="amount">金額</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${escapeHtml(data.description)}</td>
            <td class="amount">NT$ ${data.amount.toLocaleString()}</td>
          </tr>
        </tbody>
      </table>

      <div class="total-section">
        <div class="total-row grand-total">
          <span class="total-label">總計：</span>
          <span class="total-value">NT$ ${data.amount.toLocaleString()}</span>
        </div>
      </div>

      <div class="payment-info">
        <h3>付款資訊</h3>
        <p><strong>付款方式：</strong>${escapeHtml(data.paymentMethod)}</p>
        <p><strong>付款日期：</strong>${escapeHtml(data.paymentDate)}</p>
        <p><strong>付款狀態：</strong>已付款</p>
      </div>

      <div class="footer">
        感謝您的支持！<br>
        此收據由系統自動生成
      </div>
    </body>
    </html>
  `;
}

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

export function isAllowedPdfRequest(url: string): boolean {
  return url.startsWith('data:') || url.startsWith('about:');
}

// ponytail: in-process limit on concurrent Chromium pages (~150MB each), so a burst
// of downloads queues instead of exhausting memory. Move PDF rendering to a worker
// queue if volume outgrows one process (#14).
const MAX_CONCURRENT_PDF_PAGES = Math.max(1, Number(process.env.PDF_MAX_CONCURRENCY) || 2);
let activePdfPages = 0;
const waitingForPdfPage: Array<() => void> = [];

/** Run fn with at most `limit` concurrent callers; the rest wait in FIFO order. */
export async function withPdfSlot<T>(fn: () => Promise<T>, limit = MAX_CONCURRENT_PDF_PAGES): Promise<T> {
  if (activePdfPages < limit) {
    activePdfPages++;
  } else {
    // The releasing caller hands its slot over, so activePdfPages stays the same
    await new Promise<void>((resolve) => waitingForPdfPage.push(resolve));
  }
  try {
    return await fn();
  } finally {
    const next = waitingForPdfPage.shift();
    if (next) next();
    else activePdfPages--;
  }
}

async function generatePdfFromHtml(html: string): Promise<Buffer> {
  return withPdfSlot(() => renderPdf(html));
}

async function renderPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Templates are self-contained: no JS, and no network access beyond data:/about:
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (request: { url(): string; abort(): Promise<void>; continue(): Promise<void> }) => {
      if (isAllowedPdfRequest(request.url())) {
        void request.continue();
      } else {
        void request.abort();
      }
    });

    await page.setContent(html, { waitUntil: 'load' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm',
      },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await page.close();
  }
}

const PAYMENT_METHOD_NAMES: Record<string, string> = {
  CASH: '現金',
  CREDIT_CARD: '信用卡',
  DEBIT_CARD: '金融卡',
  BANK_TRANSFER: '銀行轉帳',
  LINE_PAY: 'LINE Pay',
  OTHER: '其他',
};

function formatPaymentMethod(method: string | null): string {
  return PAYMENT_METHOD_NAMES[method || ''] || method || '未指定';
}

// -----------------------------------------------------------------------------
// Export
// -----------------------------------------------------------------------------

export const pdfService = {
  generateContractPdf,
  generateInvoicePdf,
  closeBrowser,
};

export default pdfService;
