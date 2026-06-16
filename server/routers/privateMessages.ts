import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, or, desc, isNull, inArray, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { users, privateMessages, batches, batchEnrollments, privateMessageAuditLogs } from "@db/schema";
import { sendNotification } from "../lib/notificationEngine";
import { getIo } from "../lib/socketInstance";

export const privateMessageRouter = createRouter({
  sendMessage: authedQuery
    .input(
      z.object({
        receiverId: z.number(),
        content: z.string().min(1),
        type: z.enum(["text", "voice", "image", "video", "pdf"]).default("text"),
        mediaUrl: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role === "academic_head") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Read-Only Access: Academic Head cannot participate in conversations.",
        });
      }
      const db = getDb();
      const sender = ctx.user;

      const receiver = await db.query.users.findFirst({
        where: eq(users.id, input.receiverId),
      });

      if (!receiver) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Recipient user not found.",
        });
      }

      // Enforce conversation permission rules:
      // - Admin/Super Admin can message any student
      // - Student can message any Admin/Super Admin
      // - Teacher can message any student in their batches
      // - Student can message any teacher of their batches
      let allowed = false;

      const isAdminSender = ["super_admin", "admin", "academic_head"].includes(sender.role);
      const isAdminReceiver = ["super_admin", "admin", "academic_head"].includes(receiver.role);

      if (sender.role === "super_admin") {
        allowed = true;
      } else if (isAdminSender && receiver.role === "student") {
        allowed = true;
      } else if (sender.role === "student" && isAdminReceiver) {
        allowed = true;
      } else if (sender.role === "teacher" && receiver.role === "student") {
        // Find if student is enrolled in any batches taught by this teacher
        const teacherBatches = await db
          .select({ id: batches.id })
          .from(batches)
          .where(eq(batches.teacherId, sender.id));
        const batchIds = teacherBatches.map((b) => b.id);

        if (batchIds.length > 0) {
          const enrollment = await db.query.batchEnrollments.findFirst({
            where: and(
              eq(batchEnrollments.studentId, receiver.id),
              inArray(batchEnrollments.batchId, batchIds),
              eq(batchEnrollments.status, "active")
            ),
          });
          if (enrollment) allowed = true;
        }
      } else if (sender.role === "student" && receiver.role === "teacher") {
        // Find if teacher teaches any batches enrolled by this student
        const studentEnrollments = await db.query.batchEnrollments.findMany({
          where: and(
            eq(batchEnrollments.studentId, sender.id),
            eq(batchEnrollments.status, "active")
          ),
          with: { batch: true },
        });
        const teacherIds = studentEnrollments
          .map((e) => e.batch?.teacherId)
          .filter(Boolean) as number[];

        if (teacherIds.includes(receiver.id)) {
          allowed = true;
        }
      }

      if (!allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized to start or reply to a conversation with this user.",
        });
      }

      // Save message
      const result = await db
        .insert(privateMessages)
        .values({
          senderId: sender.id,
          receiverId: receiver.id,
          content: input.content,
          type: input.type,
          mediaUrl: input.mediaUrl,
          isRead: false,
        })
        .returning({ id: privateMessages.id });

      const msgId = result[0]?.id;
      const message = await db.query.privateMessages.findFirst({
        where: eq(privateMessages.id, msgId),
        with: { sender: true, receiver: true },
      });

      if (sender.role === "super_admin") {
        await db.insert(privateMessageAuditLogs).values({
          adminId: sender.id,
          action: "send",
          senderId: sender.id,
          receiverId: receiver.id,
          messageId: msgId,
          details: `Sent message in conversation with user ${receiver.id}: "${input.content.slice(0, 100)}"`,
        });
      }

      if (!message) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve the sent message.",
        });
      }

      // Trigger notification for the receiver
      await sendNotification(
        receiver.id,
        `New Private Message`,
        `${sender.name}: ${input.content.length > 50 ? input.content.slice(0, 47) + "..." : input.content}`,
        "private_message",
        { senderId: sender.id }
      );

      // Emit WebSocket update to sender and receiver personal rooms
      const io = getIo();
      if (io) {
        const payload = {
          id: message.id,
          senderId: message.senderId,
          receiverId: message.receiverId,
          content: message.content,
          type: message.type,
          mediaUrl: message.mediaUrl,
          createdAt: message.createdAt.toISOString(),
          isRead: message.isRead,
          sender: { id: sender.id, name: sender.name, role: sender.role },
          receiver: { id: receiver.id, name: receiver.name, role: receiver.role },
        };
        io.to(`user:${receiver.id}`).emit("private_message:new", payload);
        io.to(`user:${sender.id}`).emit("private_message:new", payload);
      }

      return message;
    }),

  getConversation: authedQuery
    .input(
      z.object({
        otherUserId: z.number(),
        senderId: z.number().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      const isMonitoring = input.senderId !== undefined && ["super_admin", "admin", "academic_head"].includes(ctx.user.role);
      const effectiveSenderId = isMonitoring ? input.senderId! : userId;
      const effectiveReceiverId = input.otherUserId;

      if (ctx.user.role === "super_admin") {
        await db.insert(privateMessageAuditLogs).values({
          adminId: ctx.user.id,
          action: "access",
          senderId: effectiveSenderId,
          receiverId: effectiveReceiverId,
          details: `Accessed conversation thread between user ${effectiveSenderId} and user ${effectiveReceiverId}`,
        });
      }

      if (!isMonitoring) {
        // Mark unread messages from otherUser as read
        await db
          .update(privateMessages)
          .set({ isRead: true })
          .where(
            and(
              eq(privateMessages.senderId, input.otherUserId),
              eq(privateMessages.receiverId, userId),
              eq(privateMessages.isRead, false)
            )
          );
      }

      // Retrieve conversation history
      const list = await db.query.privateMessages.findMany({
        where: and(
          or(
            and(eq(privateMessages.senderId, effectiveSenderId), eq(privateMessages.receiverId, effectiveReceiverId)),
            and(eq(privateMessages.senderId, effectiveReceiverId), eq(privateMessages.receiverId, effectiveSenderId))
          ),
          isNull(privateMessages.deletedAt)
        ),
        orderBy: desc(privateMessages.createdAt),
        limit: input.limit,
        offset: input.offset,
        with: { sender: true, receiver: true },
      });

      return list.reverse();
    }),

  listConversations: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.user.id;

    if (ctx.user.role === "super_admin" || ctx.user.role === "academic_head") {
      const allMessages = await db.query.privateMessages.findMany({
        where: isNull(privateMessages.deletedAt),
        orderBy: desc(privateMessages.createdAt),
        with: { sender: true, receiver: true },
      });

      const conversationsMap = new Map<
        string,
        {
          otherUser: { id: number; name: string; role: string; avatar: string | null };
          sender: { id: number; name: string; role: string; avatar: string | null };
          receiver: { id: number; name: string; role: string; avatar: string | null };
          lastMessage: string;
          lastMessageType: string;
          lastMessageTime: Date;
          unreadCount: number;
        }
      >();

      for (const msg of allMessages) {
        if (!msg.sender || !msg.receiver) continue;
        const key = [msg.senderId, msg.receiverId].sort((a, b) => a - b).join("-");

        if (!conversationsMap.has(key)) {
          conversationsMap.set(key, {
            otherUser: {
              id: msg.receiverId,
              name: `${msg.sender.name} ↔ ${msg.receiver.name}`,
              role: "monitoring",
              avatar: null,
            },
            sender: {
              id: msg.sender.id,
              name: msg.sender.name,
              role: msg.sender.role,
              avatar: msg.sender.avatar,
            },
            receiver: {
              id: msg.receiver.id,
              name: msg.receiver.name,
              role: msg.receiver.role,
              avatar: msg.receiver.avatar,
            },
            lastMessage: msg.content,
            lastMessageType: msg.type,
            lastMessageTime: msg.createdAt,
            unreadCount: 0,
          });
        }
      }

      return Array.from(conversationsMap.values()).sort(
        (a, b) => b.lastMessageTime.getTime() - a.lastMessageTime.getTime()
      );
    }

    // Fetch all private messages involving the current user
    const allMessages = await db.query.privateMessages.findMany({
      where: and(
        or(eq(privateMessages.senderId, userId), eq(privateMessages.receiverId, userId)),
        isNull(privateMessages.deletedAt)
      ),
      orderBy: desc(privateMessages.createdAt),
      with: { sender: true, receiver: true },
    });

    const conversationsMap = new Map<
      number,
      {
        otherUser: { id: number; name: string; role: string; avatar: string | null };
        lastMessage: string;
        lastMessageType: string;
        lastMessageTime: Date;
        unreadCount: number;
      }
    >();

    for (const msg of allMessages) {
      const otherUser = msg.senderId === userId ? msg.receiver : msg.sender;
      if (!otherUser) continue;

      const existing = conversationsMap.get(otherUser.id);
      const isFromOther = msg.senderId === otherUser.id;
      const isUnread = isFromOther && !msg.isRead;

      if (!existing) {
        conversationsMap.set(otherUser.id, {
          otherUser: {
            id: otherUser.id,
            name: otherUser.name,
            role: otherUser.role,
            avatar: otherUser.avatar,
          },
          lastMessage: msg.content,
          lastMessageType: msg.type,
          lastMessageTime: msg.createdAt,
          unreadCount: isUnread ? 1 : 0,
        });
      } else {
        if (isUnread) {
          existing.unreadCount += 1;
        }
      }
    }

    return Array.from(conversationsMap.values()).sort(
      (a, b) => b.lastMessageTime.getTime() - a.lastMessageTime.getTime()
    );
  }),

  listAvailableContacts: authedQuery
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const user = ctx.user;

      let allowedUsers: any[] = [];

      const searchFilter = input?.search
        ? sql`${users.name} ILIKE ${"%" + input.search + "%"} OR ${users.username} ILIKE ${"%" + input.search + "%"}`
        : undefined;

      if (user.role === "super_admin") {
        // Super admin can message any user except themselves
        const filters = [sql`${users.id} != ${user.id}`];
        if (searchFilter) filters.push(searchFilter);

        allowedUsers = await db.query.users.findMany({
          where: and(...filters),
          orderBy: desc(users.name),
        });
      } else if (["admin", "academic_head"].includes(user.role)) {
        // Admins can message any student
        const filters = [eq(users.role, "student")];
        if (searchFilter) filters.push(searchFilter);

        allowedUsers = await db.query.users.findMany({
          where: and(...filters),
          orderBy: desc(users.name),
        });
      } else if (user.role === "teacher") {
        // Teachers can message students enrolled in their batches
        const teacherBatches = await db
          .select({ id: batches.id })
          .from(batches)
          .where(eq(batches.teacherId, user.id));
        const batchIds = teacherBatches.map((b) => b.id);

        if (batchIds.length > 0) {
          const filters = [
            inArray(batchEnrollments.batchId, batchIds),
            eq(batchEnrollments.status, "active"),
          ];
          if (searchFilter) {
            // join users to filter
            const studentIds = await db
              .select({ studentId: batchEnrollments.studentId })
              .from(batchEnrollments)
              .innerJoin(users, eq(batchEnrollments.studentId, users.id))
              .where(and(...filters, searchFilter));
            
            const ids = studentIds.map(s => s.studentId);
            if (ids.length > 0) {
              allowedUsers = await db.query.users.findMany({
                where: inArray(users.id, ids),
                orderBy: desc(users.name),
              });
            }
          } else {
            const enrollments = await db.query.batchEnrollments.findMany({
              where: and(...filters),
              with: { student: true },
            });
            // Deduplicate
            const unique = new Map<number, any>();
            for (const e of enrollments) {
              if (e.student) {
                unique.set(e.student.id, e.student);
              }
            }
            allowedUsers = Array.from(unique.values());
          }
        }
      } else if (user.role === "student") {
        // Students can message admins and their active batch teachers
        const studentEnrollments = await db.query.batchEnrollments.findMany({
          where: and(
            eq(batchEnrollments.studentId, user.id),
            eq(batchEnrollments.status, "active")
          ),
          with: { batch: { with: { teacher: true } } },
        });

        const teacherIds = studentEnrollments
          .map((e) => e.batch?.teacherId)
          .filter(Boolean) as number[];

        const filters = [
          or(
            inArray(users.role, ["super_admin", "admin", "academic_head"]),
            teacherIds.length > 0 ? inArray(users.id, teacherIds) : sql`false`
          ),
        ];
        if (searchFilter) filters.push(searchFilter);

        allowedUsers = await db.query.users.findMany({
          where: and(...filters),
          orderBy: desc(users.name),
        });
      }

      return allowedUsers.map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        avatar: u.avatar,
      }));
    }),
  deleteMessage: authedQuery
    .input(z.object({ messageId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Super Admins can delete private messages.",
        });
      }

      const msg = await db.query.privateMessages.findFirst({
        where: eq(privateMessages.id, input.messageId),
      });

      if (!msg) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Message not found.",
        });
      }

      await db.update(privateMessages)
        .set({ deletedAt: new Date() })
        .where(eq(privateMessages.id, input.messageId));

      // Log action
      await db.insert(privateMessageAuditLogs).values({
        adminId: ctx.user.id,
        action: "delete",
        senderId: msg.senderId,
        receiverId: msg.receiverId,
        messageId: msg.id,
        details: `Deleted message: "${msg.content.slice(0, 100)}"`,
      });

      // Emit WS update so other sockets know the message is deleted
      const io = getIo();
      if (io) {
        io.to(`user:${msg.receiverId}`).emit("private_message:delete", { messageId: msg.id });
        io.to(`user:${msg.senderId}`).emit("private_message:delete", { messageId: msg.id });
      }

      return { success: true };
    }),

  editMessage: authedQuery
    .input(
      z.object({
        messageId: z.number(),
        content: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Super Admins can edit private messages.",
        });
      }

      const msg = await db.query.privateMessages.findFirst({
        where: eq(privateMessages.id, input.messageId),
      });

      if (!msg) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Message not found.",
        });
      }

      const previousContent = msg.content;
      await db.update(privateMessages)
        .set({ content: input.content })
        .where(eq(privateMessages.id, input.messageId));

      // Log action
      await db.insert(privateMessageAuditLogs).values({
        adminId: ctx.user.id,
        action: "edit",
        senderId: msg.senderId,
        receiverId: msg.receiverId,
        messageId: msg.id,
        details: `Edited message from "${previousContent.slice(0, 50)}" to "${input.content.slice(0, 50)}"`,
      });

      // Emit WS update so other sockets know the message is edited
      const io = getIo();
      if (io) {
        io.to(`user:${msg.receiverId}`).emit("private_message:edit", { messageId: msg.id, content: input.content });
        io.to(`user:${msg.senderId}`).emit("private_message:edit", { messageId: msg.id, content: input.content });
      }

      return { success: true };
    }),
});
