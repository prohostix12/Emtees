import { eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { notifications, users } from "@db/schema";
import { getIo } from "./socketInstance";

export async function isNotificationPausedForUser(userId: number, type: string): Promise<boolean> {
  const CRITICAL_TYPES = ["security", "password_change", "login_alert", "account_security"];
  if (CRITICAL_TYPES.includes(type)) {
    return false;
  }
  const db = getDb();
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { notificationsPausedUntil: true },
  });
  if (user && user.notificationsPausedUntil) {
    return user.notificationsPausedUntil.getTime() > Date.now();
  }
  return false;
}

export async function sendNotification(
  userId: number,
  title: string,
  message: string,
  type: string,
  data?: unknown
) {
  const db = getDb();
  const [inserted] = await db
    .insert(notifications)
    .values({ userId, title, message, type, data: data ?? null })
    .returning();

  if (inserted) {
    const isPaused = await isNotificationPausedForUser(userId, type);
    if (!isPaused) {
      const io = getIo();
      if (io) {
        io.to(`user:${userId}`).emit("notification:new", inserted);
      }
    }
  }
  return inserted;
}

export async function sendBulkNotification(
  userIds: number[],
  title: string,
  message: string,
  type: string,
  data?: unknown
) {
  if (userIds.length === 0) return [];
  const db = getDb();
  const insertedRows = await db
    .insert(notifications)
    .values(
      userIds.map((userId) => ({ userId, title, message, type, data: data ?? null }))
    )
    .returning();

  const io = getIo();
  if (io) {
    for (const row of insertedRows) {
      const isPaused = await isNotificationPausedForUser(row.userId, type);
      if (!isPaused) {
        io.to(`user:${row.userId}`).emit("notification:new", row);
      }
    }
  }
  return insertedRows;
}

export async function getAdminUserIds(): Promise<number[]> {
  const db = getDb();
  const admins = await db.query.users.findMany({
    where: (u, { inArray }) => inArray(u.role, ["super_admin", "admin"]),
    columns: { id: true },
  });
  return admins.map((a) => a.id);
}
