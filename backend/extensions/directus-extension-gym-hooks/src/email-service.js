/**
 * Email Service
 *
 * Business email sending using Directus MailService
 * Provides email templates for various notification types
 */

let mailService = null;
let emailEnabled = false;

/**
 * Initialize the email service with Directus services
 * @param {Object} services - Directus services object
 * @param {Object} schema - Directus schema
 * @returns {boolean} - Whether initialization was successful
 */
export function initEmailService(services, schema) {
  try {
    const { MailService } = services;

    if (!MailService) {
      // Warning logged('[EmailService] MailService not available');
      return false;
    }

    // Check if SMTP is configured
    if (!process.env.EMAIL_SMTP_HOST) {
      // Warning logged('[EmailService] SMTP not configured. Email notifications disabled.');
      // Warning logged('[EmailService] Set EMAIL_SMTP_HOST in environment to enable.');
      return false;
    }

    mailService = new MailService({ schema });
    emailEnabled = true;
    // Status logged('[EmailService] Initialized successfully');
    return true;
  } catch (error) {
    // Error logged('[EmailService] Failed to initialize:', error.message);
    return false;
  }
}

/**
 * Check if email service is ready
 * @returns {boolean}
 */
export function isEmailEnabled() {
  return emailEnabled;
}

/**
 * Send an email
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} [options.text] - Plain text content (optional)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendEmail({ to, subject, html, text }) {
  if (!emailEnabled || !mailService) {
    return { success: false, error: 'Email service not initialized' };
  }

  try {
    await mailService.send({
      to,
      subject,
      html,
      text: text || stripHtml(html),
    });

    // Status logged(`[EmailService] Email sent to ${to}: ${subject}`);
    return { success: true };
  } catch (error) {
    // Error logged('[EmailService] Send error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Strip HTML tags for plain text fallback
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
  return html
    .replace(/<style[^>]*>.*?<\/style>/gs, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================
// Email Templates
// ============================================

/**
 * Base email template wrapper
 */
function wrapTemplate(content, { brandColor = '#6366f1', logoUrl = null } = {}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #374151;
      margin: 0;
      padding: 0;
      background-color: #f3f4f6;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      background: ${brandColor};
      color: white;
      padding: 24px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .content {
      padding: 32px 24px;
    }
    .footer {
      padding: 16px 24px;
      background: #f9fafb;
      text-align: center;
      font-size: 12px;
      color: #6b7280;
    }
    .button {
      display: inline-block;
      background: ${brandColor};
      color: white !important;
      padding: 12px 24px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 500;
      margin: 16px 0;
    }
    .highlight {
      background: #fef3c7;
      padding: 16px;
      border-radius: 8px;
      border-left: 4px solid #f59e0b;
      margin: 16px 0;
    }
    .info-box {
      background: #eff6ff;
      padding: 16px;
      border-radius: 8px;
      margin: 16px 0;
    }
    table.details {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }
    table.details td {
      padding: 8px 0;
      border-bottom: 1px solid #e5e7eb;
    }
    table.details td:first-child {
      color: #6b7280;
      width: 40%;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        ${logoUrl ? `<img src="${logoUrl}" alt="Logo" style="height:40px;margin-bottom:8px;">` : ''}
        <h1>Gym Nexus</h1>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p>此郵件由系統自動發送，請勿直接回覆。</p>
        <p>&copy; ${new Date().getFullYear()} Gym Nexus. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>
`;
}

// ============================================
// Pre-built Email Templates
// ============================================

/**
 * Contract expiry reminder email
 */
export function buildContractExpiryEmail(data) {
  const { memberName, contractNo, planName, expiryDate, daysRemaining, renewUrl } = data;

  const urgencyClass = daysRemaining <= 3 ? 'highlight' : 'info-box';

  const content = `
    <h2>親愛的 ${memberName}，您好！</h2>

    <div class="${urgencyClass}">
      <strong>您的會籍即將到期</strong><br>
      剩餘 <strong>${daysRemaining} 天</strong>
    </div>

    <table class="details">
      <tr>
        <td>合約編號</td>
        <td><strong>${contractNo}</strong></td>
      </tr>
      <tr>
        <td>方案名稱</td>
        <td>${planName}</td>
      </tr>
      <tr>
        <td>到期日期</td>
        <td><strong>${expiryDate}</strong></td>
      </tr>
    </table>

    <p>為確保您的運動計畫不中斷，建議您提前續約。續約可享有會員專屬優惠！</p>

    ${renewUrl ? `<p style="text-align:center;"><a href="${renewUrl}" class="button">立即續約</a></p>` : ''}

    <p>如有任何問題，歡迎聯繫我們的服務團隊。</p>
  `;

  return {
    subject: `【會籍到期提醒】您的會籍將於 ${daysRemaining} 天後到期`,
    html: wrapTemplate(content),
  };
}

/**
 * Booking confirmation email
 */
export function buildBookingConfirmationEmail(data) {
  const { memberName, className, coachName, sessionDate, startTime, endTime, branchName, bookingCode } = data;

  const content = `
    <h2>預約確認</h2>

    <p>親愛的 ${memberName}，您的課程預約已確認！</p>

    <div class="info-box">
      <table class="details" style="margin:0;">
        <tr>
          <td>課程名稱</td>
          <td><strong>${className}</strong></td>
        </tr>
        <tr>
          <td>教練</td>
          <td>${coachName}</td>
        </tr>
        <tr>
          <td>上課日期</td>
          <td><strong>${sessionDate}</strong></td>
        </tr>
        <tr>
          <td>上課時間</td>
          <td>${startTime} - ${endTime}</td>
        </tr>
        <tr>
          <td>上課地點</td>
          <td>${branchName}</td>
        </tr>
        ${bookingCode ? `
        <tr>
          <td>預約編號</td>
          <td><strong>${bookingCode}</strong></td>
        </tr>
        ` : ''}
      </table>
    </div>

    <p><strong>溫馨提醒：</strong></p>
    <ul>
      <li>請於課程開始前 15 分鐘抵達</li>
      <li>請攜帶毛巾及水壺</li>
      <li>如需取消，請於課程開始前 2 小時取消</li>
    </ul>

    <p>期待與您相見！</p>
  `;

  return {
    subject: `【課程預約確認】${sessionDate} ${className}`,
    html: wrapTemplate(content),
  };
}

/**
 * Booking reminder email (24h / 2h before)
 */
export function buildBookingReminderEmail(data) {
  const { memberName, className, coachName, sessionDate, startTime, branchName, hoursRemaining } = data;

  const content = `
    <h2>課程提醒</h2>

    <p>親愛的 ${memberName}，提醒您即將有課程！</p>

    <div class="highlight">
      <strong>${className}</strong> 將於 <strong>${hoursRemaining} 小時後</strong>開始
    </div>

    <table class="details">
      <tr>
        <td>上課時間</td>
        <td><strong>${sessionDate} ${startTime}</strong></td>
      </tr>
      <tr>
        <td>教練</td>
        <td>${coachName}</td>
      </tr>
      <tr>
        <td>地點</td>
        <td>${branchName}</td>
      </tr>
    </table>

    <p>請準時出席，我們在健身房等您！</p>
  `;

  return {
    subject: `【課程提醒】${className} 即將開始`,
    html: wrapTemplate(content),
  };
}

/**
 * Class cancellation email
 */
export function buildClassCancelledEmail(data) {
  const { memberName, className, sessionDate, startTime, reason, rescheduleUrl } = data;

  const content = `
    <h2>課程取消通知</h2>

    <p>親愛的 ${memberName}，很抱歉通知您：</p>

    <div class="highlight">
      <strong>${sessionDate} ${startTime}</strong> 的 <strong>${className}</strong> 已取消
    </div>

    ${reason ? `<p><strong>取消原因：</strong>${reason}</p>` : ''}

    <p>造成您的不便，我們深感抱歉。您可以：</p>
    <ul>
      <li>預約其他時段的課程</li>
      <li>聯繫客服了解更多資訊</li>
    </ul>

    ${rescheduleUrl ? `<p style="text-align:center;"><a href="${rescheduleUrl}" class="button">重新預約課程</a></p>` : ''}
  `;

  return {
    subject: `【課程取消】${sessionDate} ${className} 已取消`,
    html: wrapTemplate(content),
  };
}

/**
 * Welcome email for new members
 */
export function buildWelcomeEmail(data) {
  const { memberName, memberCode, branchName, appUrl } = data;

  const content = `
    <h2>歡迎加入 Gym Nexus！</h2>

    <p>親愛的 ${memberName}，</p>

    <p>感謝您成為 Gym Nexus 的會員！我們非常高興能與您一起展開健康的旅程。</p>

    <div class="info-box">
      <table class="details" style="margin:0;">
        <tr>
          <td>會員編號</td>
          <td><strong>${memberCode}</strong></td>
        </tr>
        ${branchName ? `
        <tr>
          <td>所屬分店</td>
          <td>${branchName}</td>
        </tr>
        ` : ''}
      </table>
    </div>

    <p><strong>您可以享有以下服務：</strong></p>
    <ul>
      <li>使用健身房設施</li>
      <li>預約團體課程</li>
      <li>專業教練指導</li>
      <li>會員專屬優惠</li>
    </ul>

    ${appUrl ? `
    <p>下載我們的 App，隨時隨地管理您的會籍：</p>
    <p style="text-align:center;"><a href="${appUrl}" class="button">開始使用</a></p>
    ` : ''}

    <p>期待在健身房見到您！</p>
  `;

  return {
    subject: '歡迎加入 Gym Nexus！',
    html: wrapTemplate(content),
  };
}

/**
 * Payment confirmation email
 */
export function buildPaymentConfirmationEmail(data) {
  const { memberName, contractNo, planName, amount, paymentMethod, paymentDate, receiptUrl } = data;

  const content = `
    <h2>付款確認</h2>

    <p>親愛的 ${memberName}，您的付款已成功處理！</p>

    <div class="info-box">
      <table class="details" style="margin:0;">
        <tr>
          <td>合約編號</td>
          <td><strong>${contractNo}</strong></td>
        </tr>
        <tr>
          <td>方案名稱</td>
          <td>${planName}</td>
        </tr>
        <tr>
          <td>付款金額</td>
          <td><strong>NT$ ${amount.toLocaleString()}</strong></td>
        </tr>
        <tr>
          <td>付款方式</td>
          <td>${paymentMethod}</td>
        </tr>
        <tr>
          <td>付款日期</td>
          <td>${paymentDate}</td>
        </tr>
      </table>
    </div>

    ${receiptUrl ? `<p style="text-align:center;"><a href="${receiptUrl}" class="button">查看收據</a></p>` : ''}

    <p>感謝您的信任與支持！</p>
  `;

  return {
    subject: `【付款確認】NT$ ${amount.toLocaleString()} 付款成功`,
    html: wrapTemplate(content),
  };
}

/**
 * Password reset email
 */
export function buildPasswordResetEmail(data) {
  const { memberName, resetUrl, expiresIn = '1 小時' } = data;

  const content = `
    <h2>密碼重設</h2>

    <p>親愛的 ${memberName}，</p>

    <p>我們收到了您的密碼重設請求。點擊下方按鈕設定新密碼：</p>

    <p style="text-align:center;"><a href="${resetUrl}" class="button">重設密碼</a></p>

    <p><small>此連結將於 ${expiresIn} 後失效。</small></p>

    <div class="highlight">
      <strong>安全提醒：</strong>如果您沒有請求重設密碼，請忽略此郵件。您的帳戶仍然安全。
    </div>
  `;

  return {
    subject: '【Gym Nexus】密碼重設請求',
    html: wrapTemplate(content),
  };
}

/**
 * Leave request notification (for HR)
 */
export function buildLeaveRequestEmail(data) {
  const { employeeName, leaveType, startDate, endDate, days, reason, approveUrl, rejectUrl } = data;

  const leaveTypeNames = {
    annual: '年假',
    sick: '病假',
    personal: '事假',
    compensatory: '補休',
    maternity: '產假',
    paternity: '陪產假',
    bereavement: '喪假',
    marriage: '婚假',
    menstrual: '生理假',
    unpaid: '無薪假',
  };

  const content = `
    <h2>休假申請通知</h2>

    <p>您有一筆新的休假申請待審核：</p>

    <table class="details">
      <tr>
        <td>申請人</td>
        <td><strong>${employeeName}</strong></td>
      </tr>
      <tr>
        <td>假別</td>
        <td>${leaveTypeNames[leaveType] || leaveType}</td>
      </tr>
      <tr>
        <td>開始日期</td>
        <td>${startDate}</td>
      </tr>
      <tr>
        <td>結束日期</td>
        <td>${endDate}</td>
      </tr>
      <tr>
        <td>天數</td>
        <td><strong>${days} 天</strong></td>
      </tr>
      ${reason ? `
      <tr>
        <td>事由</td>
        <td>${reason}</td>
      </tr>
      ` : ''}
    </table>

    ${approveUrl && rejectUrl ? `
    <p style="text-align:center;">
      <a href="${approveUrl}" class="button" style="background:#10b981;">核准</a>
      &nbsp;&nbsp;
      <a href="${rejectUrl}" class="button" style="background:#ef4444;">駁回</a>
    </p>
    ` : ''}
  `;

  return {
    subject: `【休假申請】${employeeName} 申請 ${leaveTypeNames[leaveType] || leaveType} ${days} 天`,
    html: wrapTemplate(content),
  };
}

/**
 * Build email by notification type
 * @param {string} type - Notification type
 * @param {Object} data - Data for the email
 * @returns {Object} - { subject, html }
 */
export function buildEmailByType(type, data) {
  const builders = {
    contract_expiry_7d: () => buildContractExpiryEmail({ ...data, daysRemaining: 7 }),
    contract_expiry_3d: () => buildContractExpiryEmail({ ...data, daysRemaining: 3 }),
    contract_expiry_1d: () => buildContractExpiryEmail({ ...data, daysRemaining: 1 }),
    booking_confirmation: () => buildBookingConfirmationEmail(data),
    booking_reminder_24h: () => buildBookingReminderEmail({ ...data, hoursRemaining: 24 }),
    booking_reminder_2h: () => buildBookingReminderEmail({ ...data, hoursRemaining: 2 }),
    class_cancelled: () => buildClassCancelledEmail(data),
    welcome: () => buildWelcomeEmail(data),
    payment_confirmation: () => buildPaymentConfirmationEmail(data),
    password_reset: () => buildPasswordResetEmail(data),
    leave_request: () => buildLeaveRequestEmail(data),
  };

  const builder = builders[type];
  if (!builder) {
    // Default generic email
    return {
      subject: data.subject || 'Gym Nexus 通知',
      html: wrapTemplate(`<p>${data.message || '您有新的通知。'}</p>`),
    };
  }

  return builder();
}
