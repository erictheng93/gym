/**
 * PDF Generator Service
 * 发票 PDF 生成服务
 *
 * 依赖：需要安装 puppeteer 或 html-pdf
 * npm install puppeteer
 *
 * 或者使用更轻量的方案：
 * npm install html-pdf-node
 */

import { logger } from '../utils/logger.js';

/**
 * 发票 HTML 模板
 */
function generateInvoiceHTML(invoice, tenant) {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('zh-TW', {
      style: 'currency',
      currency: invoice.currency || 'TWD'
    }).format(amount);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const lineItems = invoice.line_items ? JSON.parse(invoice.line_items) : [];

  return `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>发票 ${invoice.invoice_number}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Noto Sans TC', 'Microsoft JhengHei', Arial, sans-serif;
            font-size: 14px;
            line-height: 1.6;
            color: #333;
            padding: 40px;
        }

        .invoice-container {
            max-width: 800px;
            margin: 0 auto;
            background: #fff;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 40px;
            padding-bottom: 20px;
            border-bottom: 2px solid #0071e3;
        }

        .company-info {
            flex: 1;
        }

        .company-name {
            font-size: 24px;
            font-weight: 700;
            color: #0071e3;
            margin-bottom: 8px;
        }

        .company-details {
            font-size: 12px;
            color: #666;
            line-height: 1.8;
        }

        .invoice-title {
            text-align: right;
            flex: 1;
        }

        .invoice-title h1 {
            font-size: 32px;
            font-weight: 700;
            color: #333;
            margin-bottom: 8px;
        }

        .invoice-number {
            font-size: 14px;
            color: #666;
        }

        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            margin-bottom: 40px;
        }

        .info-block {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
        }

        .info-block-title {
            font-size: 12px;
            font-weight: 600;
            color: #666;
            text-transform: uppercase;
            margin-bottom: 12px;
            letter-spacing: 0.5px;
        }

        .info-block-content {
            font-size: 14px;
            line-height: 1.8;
        }

        .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 4px;
        }

        .info-label {
            color: #666;
        }

        .info-value {
            font-weight: 500;
            color: #333;
        }

        .line-items {
            margin-bottom: 40px;
        }

        .line-items table {
            width: 100%;
            border-collapse: collapse;
        }

        .line-items th {
            background: #f8f9fa;
            padding: 12px;
            text-align: left;
            font-weight: 600;
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 2px solid #dee2e6;
        }

        .line-items td {
            padding: 12px;
            border-bottom: 1px solid #dee2e6;
        }

        .line-items tr:last-child td {
            border-bottom: 2px solid #dee2e6;
        }

        .text-right {
            text-align: right;
        }

        .totals {
            margin-left: auto;
            width: 300px;
            margin-bottom: 40px;
        }

        .totals-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
        }

        .totals-row.subtotal {
            color: #666;
        }

        .totals-row.tax {
            color: #666;
        }

        .totals-row.total {
            border-top: 2px solid #dee2e6;
            margin-top: 8px;
            padding-top: 12px;
            font-size: 18px;
            font-weight: 700;
            color: #0071e3;
        }

        .payment-info {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 20px;
            margin-bottom: 40px;
            border-radius: 4px;
        }

        .payment-info-title {
            font-weight: 600;
            margin-bottom: 8px;
            color: #856404;
        }

        .payment-info-content {
            font-size: 13px;
            color: #856404;
            line-height: 1.8;
        }

        .footer {
            text-align: center;
            font-size: 12px;
            color: #999;
            padding-top: 20px;
            border-top: 1px solid #dee2e6;
        }

        .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .status-paid {
            background: #d4edda;
            color: #155724;
        }

        .status-open {
            background: #fff3cd;
            color: #856404;
        }

        .status-overdue {
            background: #f8d7da;
            color: #721c24;
        }

        @media print {
            body {
                padding: 0;
            }

            .invoice-container {
                max-width: none;
            }
        }
    </style>
</head>
<body>
    <div class="invoice-container">
        <!-- Header -->
        <div class="header">
            <div class="company-info">
                <div class="company-name">Gym Nexus</div>
                <div class="company-details">
                    健身房管理系统<br>
                    台湾台北市<br>
                    电话: +886-2-xxxx-xxxx<br>
                    邮箱: billing@gym-nexus.com
                </div>
            </div>
            <div class="invoice-title">
                <h1>发票</h1>
                <div class="invoice-number">${invoice.invoice_number}</div>
            </div>
        </div>

        <!-- Info Grid -->
        <div class="info-grid">
            <!-- Customer Info -->
            <div class="info-block">
                <div class="info-block-title">账单地址</div>
                <div class="info-block-content">
                    <strong>${tenant.name}</strong><br>
                    ${tenant.email}<br>
                    ${tenant.phone || ''}
                </div>
            </div>

            <!-- Invoice Info -->
            <div class="info-block">
                <div class="info-block-content">
                    <div class="info-row">
                        <span class="info-label">发票日期:</span>
                        <span class="info-value">${formatDate(invoice.date_created)}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">到期日:</span>
                        <span class="info-value">${formatDate(invoice.due_date)}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">计费周期:</span>
                        <span class="info-value">${formatDate(invoice.period_start)} - ${formatDate(invoice.period_end)}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">状态:</span>
                        <span class="info-value">
                            <span class="status-badge ${invoice.status === 'paid' ? 'status-paid' : 'status-open'}">
                                ${invoice.status === 'paid' ? '已付款' : '待付款'}
                            </span>
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Line Items -->
        <div class="line-items">
            <table>
                <thead>
                    <tr>
                        <th>项目说明</th>
                        <th class="text-right">数量</th>
                        <th class="text-right">单价</th>
                        <th class="text-right">金额</th>
                    </tr>
                </thead>
                <tbody>
                    ${lineItems.map(item => `
                    <tr>
                        <td>${item.description || ''}</td>
                        <td class="text-right">${item.quantity || 1}</td>
                        <td class="text-right">${formatCurrency(item.unit_price || 0)}</td>
                        <td class="text-right">${formatCurrency(item.amount || 0)}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <!-- Totals -->
        <div class="totals">
            <div class="totals-row subtotal">
                <span>小计:</span>
                <span>${formatCurrency(invoice.amount_subtotal)}</span>
            </div>
            <div class="totals-row tax">
                <span>税费 (5%):</span>
                <span>${formatCurrency(invoice.amount_tax)}</span>
            </div>
            <div class="totals-row total">
                <span>总计:</span>
                <span>${formatCurrency(invoice.amount_total)}</span>
            </div>
        </div>

        <!-- Payment Info -->
        ${invoice.status !== 'paid' ? `
        <div class="payment-info">
            <div class="payment-info-title">付款信息</div>
            <div class="payment-info-content">
                请在到期日 <strong>${formatDate(invoice.due_date)}</strong> 前完成付款。<br>
                支持的付款方式：信用卡、银行转账、LINE Pay、绿界支付<br>
                如有任何疑问，请联系 billing@gym-nexus.com
            </div>
        </div>
        ` : `
        <div class="payment-info" style="background: #d4edda; border-left-color: #28a745;">
            <div class="payment-info-title" style="color: #155724;">付款完成</div>
            <div class="payment-info-content" style="color: #155724;">
                此发票已于 <strong>${formatDate(invoice.paid_at)}</strong> 付款完成。<br>
                付款方式：${invoice.payment_method || '未知'}<br>
                感谢您的惠顾！
            </div>
        </div>
        `}

        <!-- Footer -->
        <div class="footer">
            <p>本发票由 Gym Nexus 系统自动生成</p>
            <p>© ${new Date().getFullYear()} Gym Nexus. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
  `.trim();
}

/**
 * PDF 生成器类
 */
class PDFGenerator {
  /**
   * 生成发票 PDF
   * @param {object} invoice - 发票数据
   * @param {object} tenant - 租户数据
   * @returns {Promise<Buffer>} - PDF 文件的 Buffer
   */
  async generateInvoicePDF(invoice, tenant) {
    // 生成 HTML
    const html = generateInvoiceHTML(invoice, tenant);

    // 方法 1: 使用 puppeteer（推荐，但需要 Chrome/Chromium）
    try {
      // const puppeteer = require('puppeteer');
      // const browser = await puppeteer.launch({
      //   headless: 'new',
      //   args: ['--no-sandbox', '--disable-setuid-sandbox']
      // });
      // const page = await browser.newPage();
      // await page.setContent(html, { waitUntil: 'networkidle0' });
      // const pdf = await page.pdf({
      //   format: 'A4',
      //   margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
      //   printBackground: true
      // });
      // await browser.close();
      // return pdf;

      // 方法 2: 使用 html-pdf-node（更轻量）
      // const htmlPdf = require('html-pdf-node');
      // const options = {
      //   format: 'A4',
      //   margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' }
      // };
      // const file = { content: html };
      // const pdfBuffer = await htmlPdf.generatePdf(file, options);
      // return pdfBuffer;

      // 占位符：返回 HTML（在实际部署时替换为上述方法之一）
      logger.warn('PDF generation library not installed, returning HTML instead');
      return Buffer.from(html, 'utf-8');
    } catch (error) {
      logger.error('Error generating PDF', { error: error.message });
      // 降级方案：返回 HTML
      return Buffer.from(html, 'utf-8');
    }
  }

  /**
   * 生成发票 HTML（用于预览）
   * @param {object} invoice - 发票数据
   * @param {object} tenant - 租户数据
   * @returns {string} - HTML 字符串
   */
  generateInvoiceHTML(invoice, tenant) {
    return generateInvoiceHTML(invoice, tenant);
  }
}

export default PDFGenerator;
