import webPush from 'web-push';
import { db, pushSubscriptions } from '../db/index.js';
import { eq, inArray } from 'drizzle-orm';

// Type guard for web-push errors
function isWebPushError(error: unknown): error is { statusCode: number } {
  return typeof error === 'object' && error !== null && 'statusCode' in error;
}

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
}

const PUSH_SUBSCRIPTION_SELECT = {
  id: pushSubscriptions.id,
  endpoint: pushSubscriptions.endpoint,
  p256dh: pushSubscriptions.p256dh,
  auth: pushSubscriptions.auth,
};

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
      .select(PUSH_SUBSCRIPTION_SELECT)
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));

    if (subscriptions.length === 0) {
      return 0;
    }

    const stringifiedPayload = JSON.stringify(payload);
    const expiredIds: string[] = [];
    let successCount = 0;

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            stringifiedPayload
          );
          successCount++;
        } catch (error: unknown) {
          if (isWebPushError(error) && (error.statusCode === 410 || error.statusCode === 404)) {
            expiredIds.push(sub.id);
          }
          console.error('[Push] Send failed:', error);
        }
      })
    );

    if (expiredIds.length > 0) {
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, expiredIds));
    }

    return successCount;
  }

  async sendToMember(memberId: string, payload: PushPayload): Promise<number> {
    if (!this.initialized) {
      console.warn('[Push] VAPID not configured, skipping push');
      return 0;
    }

    const subscriptions = await db
      .select(PUSH_SUBSCRIPTION_SELECT)
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.memberId, memberId));

    if (subscriptions.length === 0) {
      return 0;
    }

    const stringifiedPayload = JSON.stringify(payload);
    const expiredIds: string[] = [];
    let successCount = 0;

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            stringifiedPayload
          );
          successCount++;
        } catch (error: unknown) {
          if (isWebPushError(error) && (error.statusCode === 410 || error.statusCode === 404)) {
            expiredIds.push(sub.id);
          }
          console.error('[Push] Send failed:', error);
        }
      })
    );

    if (expiredIds.length > 0) {
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, expiredIds));
    }

    return successCount;
  }

  getPublicKey(): string | null {
    return process.env.VAPID_PUBLIC_KEY || null;
  }
}

export const pushService = new PushService();
