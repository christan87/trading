import { ObjectId } from "mongodb";
import { getCollections } from "@/lib/db/mongodb";
import { getRedis, REDIS_KEYS } from "@/lib/utils/redis";
import type { AppNotification, NotificationType } from "@/lib/db/models";

export type { NotificationType };

const UNREAD_CACHE_TTL = 30; // seconds

export class NotificationService {
  async create(params: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    severity: AppNotification["severity"];
    relatedEntityType?: string;
    relatedEntityId?: string;
  }): Promise<void> {
    const { notifications } = await getCollections();
    const uid = new ObjectId(params.userId);

    const doc: Omit<AppNotification, "_id"> = {
      userId: uid,
      type: params.type,
      title: params.title,
      message: params.message,
      severity: params.severity,
      relatedEntityType: params.relatedEntityType ?? null,
      relatedEntityId: params.relatedEntityId ? new ObjectId(params.relatedEntityId) : null,
      read: false,
      createdAt: new Date(),
    };

    await notifications.insertOne(doc as AppNotification);
    // Invalidate cached unread count
    await getRedis().del(REDIS_KEYS.notifUnread(params.userId));
  }

  async getRecent(userId: string, limit = 30): Promise<AppNotification[]> {
    const { notifications } = await getCollections();
    return notifications
      .find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  async getUnreadCount(userId: string): Promise<number> {
    const redis = getRedis();
    const cached = await redis.get<number>(REDIS_KEYS.notifUnread(userId));
    if (cached !== null) return cached;

    const { notifications } = await getCollections();
    const count = await notifications.countDocuments({
      userId: new ObjectId(userId),
      read: false,
    });
    await redis.set(REDIS_KEYS.notifUnread(userId), count, { ex: UNREAD_CACHE_TTL });
    return count;
  }

  async markRead(notificationId: string, userId: string): Promise<void> {
    const { notifications } = await getCollections();
    await notifications.updateOne(
      { _id: new ObjectId(notificationId), userId: new ObjectId(userId) },
      { $set: { read: true } }
    );
    await getRedis().del(REDIS_KEYS.notifUnread(userId));
  }

  async markAllRead(userId: string): Promise<void> {
    const { notifications } = await getCollections();
    await notifications.updateMany(
      { userId: new ObjectId(userId), read: false },
      { $set: { read: true } }
    );
    await getRedis().set(REDIS_KEYS.notifUnread(userId), 0, { ex: UNREAD_CACHE_TTL });
  }
}

export const notificationService = new NotificationService();
