import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
}

class EmailService {
  private transporter: Transporter | null = null;

  constructor() {
    if (process.env.SMTP_HOST) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      });
    }
  }

  async send(options: EmailOptions): Promise<boolean> {
    if (!this.transporter) {
      console.warn('[Email] SMTP not configured, skipping email');
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@gym-nexus.com',
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
      return true;
    } catch (error) {
      console.error('[Email] Send failed:', error);
      return false;
    }
  }

  async sendWelcome(email: string, memberName: string, branchName: string): Promise<boolean> {
    return this.send({
      to: email,
      subject: `歡迎加入 ${branchName}！`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">歡迎加入 ${branchName}！</h1>
          <p>親愛的 ${memberName}，</p>
          <p>感謝您成為我們的會員！我們很高興能為您服務。</p>
          <p>您可以使用我們的會員 App 來：</p>
          <ul>
            <li>預約課程</li>
            <li>查看會籍狀態</li>
            <li>掃碼入場</li>
          </ul>
          <p>如有任何問題，歡迎聯繫我們。</p>
          <p>祝您運動愉快！</p>
        </div>
      `,
    });
  }

  async sendContractExpiry(
    email: string,
    memberName: string,
    contractNo: string,
    endDate: string,
    daysLeft: number
  ): Promise<boolean> {
    return this.send({
      to: email,
      subject: `會籍即將到期提醒 - 還剩 ${daysLeft} 天`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">會籍到期提醒</h1>
          <p>親愛的 ${memberName}，</p>
          <p>您的合約 <strong>${contractNo}</strong> 將於 <strong>${endDate}</strong> 到期。</p>
          <p>還剩 <strong>${daysLeft}</strong> 天！</p>
          <p>為了不中斷您的運動計畫，請儘快聯繫我們續約。</p>
          <p>謝謝您的支持！</p>
        </div>
      `,
    });
  }

  async sendBookingConfirmation(
    email: string,
    memberName: string,
    className: string,
    date: string,
    time: string,
    branchName: string
  ): Promise<boolean> {
    return this.send({
      to: email,
      subject: `課程預約成功 - ${className}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">預約成功！</h1>
          <p>親愛的 ${memberName}，</p>
          <p>您已成功預約以下課程：</p>
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p><strong>課程：</strong>${className}</p>
            <p><strong>日期：</strong>${date}</p>
            <p><strong>時間：</strong>${time}</p>
            <p><strong>地點：</strong>${branchName}</p>
          </div>
          <p>請準時出席，如需取消請提前 2 小時操作。</p>
        </div>
      `,
    });
  }
}

export const emailService = new EmailService();
