import webPush from 'web-push';
import { db, pushSubscriptions } from '../db/index.js';
import { eq } from 'drizzle-orm';

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
}

class PushService {
  private initialized = false;

  constructor() {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      webPush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@gym-nexus.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );
      this.initialized = true;
    }
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<number> {
    if (!this.initialized) {
      console.warn('[Push] VAPID not configured, skipping push');
      return 0;
    }

    const subscriptions = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));

    let successCount = 0;

    for (const sub of subscriptions) {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          JSON.stringify(payload)
        );
        successCount++;
      } catch (error: any) {
        if (error.statusCode === 410 || error.statusCode === 404) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        }
        console.error('[Push] Send failed:', error);
      }
    }

    return successCount;
  }

  async sendToMember(memberId: string, payload: PushPayload): Promise<number> {
    if (!this.initialized) {
      console.warn('[Push] VAPID not configured, skipping push');
      return 0;
    }

    const subscriptions = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.memberId, memberId));

    let successCount = 0;

    for (const sub of subscriptions) {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          JSON.stringify(payload)
        );
        successCount++;
      } catch (error: any) {
        if (error.statusCode === 410 || error.statusCode === 404) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        }
        console.error('[Push] Send failed:', error);
      }
    }

    return successCount;
  }

  getPublicKey(): string | null {
    return process.env.VAPID_PUBLIC_KEY || null;
  }
}

export const pushService = new PushService();
