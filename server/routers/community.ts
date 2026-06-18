import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, asc, inArray, sql } from "drizzle-orm";
import { createRouter, authedQuery, adminQuery, teacherQuery } from "../middleware";
import { getDb } from "../queries/connection";
import {
  users,
  profiles,
  modules,
  batches,
  batchEnrollments,
  classes,
  classBatches,
  attendance,
  announcements,
  communityLessons,
  communityPosts,
  communityComments,
  communityPostReactions,
  communityCareers,
  communitySavedCareers,
  communitySuccessStories,
  communityLessonViews,
  communityActiveUsers,
} from "@db/schema";
import { sendNotification, sendBulkNotification } from "../lib/notificationEngine";

// Helper to ensure the default community module and batch exist
export async function getOrCreateCommunityBatch() {
  const db = getDb();
  
  // Find batch with isCommunityGroup = true
  let batch = await db.query.batches.findFirst({
    where: eq(batches.isCommunityGroup, true),
  });
  
  if (!batch) {
    // Check if we have the community module
    let moduleRecord = await db.query.modules.findFirst({
      where: eq(modules.name, "Lifetime Learning Circle"),
    });
    
    if (!moduleRecord) {
      const [newModule] = await db
        .insert(modules)
        .values({
          name: "Lifetime Learning Circle",
          description: "Permanent learning circle for all alumni",
          status: "active",
        })
        .returning();
      moduleRecord = newModule;
    }
    
    const [newBatch] = await db
      .insert(batches)
      .values({
        moduleId: moduleRecord.id,
        name: "Lifetime Learning Circle Batch",
        description: "Dedicated batch for community members",
        status: "active",
        isCommunityGroup: true,
      })
      .returning();
    batch = newBatch;
  }
  
  return batch;
}

export const communityRouter = createRouter({
  // Analytics: Track Daily Active User
  trackActiveUser: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    const todayStr = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
    try {
      await db
        .insert(communityActiveUsers)
        .values({
          userId: ctx.user.id,
          activeDate: todayStr,
        })
        .onConflictDoNothing();
      return { success: true };
    } catch (error) {
      console.error("Error logging active user:", error);
      return { success: false };
    }
  }),

  // Dashboard Summary Page Data
  getDashboardData: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const batchRecord = await getOrCreateCommunityBatch();
    
    // 1. Total members
    const membersCountRes = await db
      .select({ count: sql<number>`count(*)` })
      .from(batchEnrollments)
      .where(
        and(
          eq(batchEnrollments.batchId, batchRecord.id),
          eq(batchEnrollments.status, "active")
        )
      );
    const totalMembers = Number(membersCountRes[0]?.count || 0);

    // 2. Today's Lesson
    const todayLesson = await db.query.communityLessons.findFirst({
      orderBy: desc(communityLessons.publishedAt),
    });

    // 3. Announcements for the community batch
    const communityAnnouncements = await db.query.announcements.findMany({
      where: and(
        eq(announcements.audienceType, "batch"),
        eq(announcements.audienceId, batchRecord.id)
      ),
      orderBy: desc(announcements.createdAt),
      limit: 5,
    });

    // 4. Upcoming Live Sessions
    const upcomingSessions = await db.query.classes.findMany({
      where: and(
        eq(classes.batchId, batchRecord.id),
        eq(classes.status, "scheduled")
      ),
      with: {
        teacher: {
          columns: { name: true, avatar: true },
        },
      },
      orderBy: asc(classes.scheduledAt),
      limit: 3,
    });

    // 5. Recent Discussion Posts
    const recentPosts = await db.query.communityPosts.findMany({
      orderBy: desc(communityPosts.createdAt),
      limit: 5,
      with: {
        author: {
          columns: { name: true, role: true, avatar: true },
        },
      },
    });

    // 6. Recent Career Opportunities
    const recentCareers = await db.query.communityCareers.findMany({
      orderBy: desc(communityCareers.createdAt),
      limit: 3,
    });

    return {
      welcomeMessage: `Welcome back, ${ctx.user.name}!`,
      totalMembers,
      todayLesson,
      announcements: communityAnnouncements,
      upcomingSessions,
      recentPosts,
      recentCareers,
      batchId: batchRecord.id,
    };
  }),

  // Daily One-Class System
  listLessons: authedQuery.query(async () => {
    const db = getDb();
    return db.query.communityLessons.findMany({
      orderBy: desc(communityLessons.publishedAt),
      with: {
        publisher: {
          columns: { name: true },
        },
        views: true,
      },
    });
  }),

  createLesson: teacherQuery
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        type: z.enum(["pdf", "docx", "ppt", "pptx", "video", "youtube", "text"]),
        contentUrl: z.string().optional(),
        youtubeUrl: z.string().optional(),
        textContent: z.string().optional(),
        fileName: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const batchRecord = await getOrCreateCommunityBatch();

      const [newLesson] = await db
        .insert(communityLessons)
        .values({
          ...input,
          publishedBy: ctx.user.id,
        })
        .returning();

      // Get all active community member user IDs
      const enrollments = await db.query.batchEnrollments.findMany({
        where: and(
          eq(batchEnrollments.batchId, batchRecord.id),
          eq(batchEnrollments.status, "active")
        ),
        columns: { studentId: true },
      });
      const memberIds = enrollments.map((e) => e.studentId);

      // Send notifications to all community members
      if (memberIds.length > 0) {
        await sendBulkNotification(
          memberIds,
          "New Daily Class Published",
          `A new daily session titled "${input.title}" has been published in the Lifetime Learning Circle.`,
          "community_daily_class"
        );
      }

      return newLesson;
    }),

  viewLesson: authedQuery
    .input(z.object({ lessonId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await db
        .insert(communityLessonViews)
        .values({
          lessonId: input.lessonId,
          userId: ctx.user.id,
        })
        .onConflictDoNothing();
      return { success: true };
    }),

  // Discussion Forum
  listPosts: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const posts = await db.query.communityPosts.findMany({
      orderBy: [desc(communityPosts.isPinned), desc(communityPosts.createdAt)],
      with: {
        author: {
          columns: { name: true, role: true, avatar: true },
        },
        reactions: true,
      },
    });

    // Fetch comments counts
    const commentCounts = await db
      .select({
        postId: communityComments.postId,
        count: sql<number>`count(*)`,
      })
      .from(communityComments)
      .groupBy(communityComments.postId);

    const countsMap = new Map(commentCounts.map((c) => [c.postId, Number(c.count)]));

    return posts.map((post) => {
      const likesCount = post.reactions.filter((r) => r.reaction === "like").length;
      const isLiked = post.reactions.some((r) => r.userId === ctx.user.id && r.reaction === "like");
      return {
        ...post,
        likesCount,
        isLiked,
        commentsCount: countsMap.get(post.id) || 0,
      };
    });
  }),

  createPost: authedQuery
    .input(
      z.object({
        title: z.string().optional(),
        content: z.string().min(1),
        mediaUrl: z.string().optional(),
        mediaName: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const [newPost] = await db
        .insert(communityPosts)
        .values({
          ...input,
          authorId: ctx.user.id,
          isPinned: false,
        })
        .returning();
      return newPost;
    }),

  deletePost: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const post = await db.query.communityPosts.findFirst({
        where: eq(communityPosts.id, input.id),
      });

      if (!post) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }

      // Allow author, super_admin, admin, academic_head, teacher to delete
      const hasPermission =
        post.authorId === ctx.user.id ||
        ["super_admin", "admin", "academic_head", "teacher"].includes(ctx.user.role);

      if (!hasPermission) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You don't have permission to delete this post" });
      }

      await db.delete(communityPosts).where(eq(communityPosts.id, input.id));
      return { success: true };
    }),

  pinPost: adminQuery
    .input(z.object({ id: z.number(), pin: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db
        .update(communityPosts)
        .set({ isPinned: input.pin })
        .where(eq(communityPosts.id, input.id));
      return { success: true };
    }),

  likePost: authedQuery
    .input(z.object({ postId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const existing = await db.query.communityPostReactions.findFirst({
        where: and(
          eq(communityPostReactions.postId, input.postId),
          eq(communityPostReactions.userId, ctx.user.id)
        ),
      });

      if (existing) {
        await db
          .delete(communityPostReactions)
          .where(eq(communityPostReactions.id, existing.id));
        return { liked: false };
      } else {
        await db.insert(communityPostReactions).values({
          postId: input.postId,
          userId: ctx.user.id,
          reaction: "like",
        });
        return { liked: true };
      }
    }),

  listComments: authedQuery
    .input(z.object({ postId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.query.communityComments.findMany({
        where: eq(communityComments.postId, input.postId),
        orderBy: asc(communityComments.createdAt),
        with: {
          author: {
            columns: { name: true, role: true, avatar: true },
          },
        },
      });
    }),

  createComment: authedQuery
    .input(
      z.object({
        postId: z.number(),
        content: z.string().min(1),
        parentId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const [newComment] = await db
        .insert(communityComments)
        .values({
          postId: input.postId,
          content: input.content,
          parentId: input.parentId ?? null,
          authorId: ctx.user.id,
        })
        .returning();

      // If this is a reply to another post/comment, notify the author of the post (if not the commenter)
      const post = await db.query.communityPosts.findFirst({
        where: eq(communityPosts.id, input.postId),
      });

      if (post && post.authorId !== ctx.user.id) {
        await sendNotification(
          post.authorId,
          "New Comment on Forum Post",
          `${ctx.user.name} commented on your forum discussion thread.`,
          "community_comment",
          { postId: post.id }
        );
      }

      return newComment;
    }),

  deleteComment: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const comment = await db.query.communityComments.findFirst({
        where: eq(communityComments.id, input.id),
      });

      if (!comment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });
      }

      // Allow author, super_admin, admin, academic_head, teacher to delete
      const hasPermission =
        comment.authorId === ctx.user.id ||
        ["super_admin", "admin", "academic_head", "teacher"].includes(ctx.user.role);

      if (!hasPermission) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You don't have permission to delete this comment" });
      }

      await db.delete(communityComments).where(eq(communityComments.id, input.id));
      return { success: true };
    }),

  // Career Opportunities Section
  listCareers: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const careersList = await db.query.communityCareers.findMany({
      orderBy: desc(communityCareers.createdAt),
      with: {
        savedBy: true,
      },
    });

    return careersList.map((c) => {
      const isSaved = c.savedBy.some((s) => s.userId === ctx.user.id);
      return {
        ...c,
        isSaved,
      };
    });
  }),

  createCareer: adminQuery
    .input(
      z.object({
        title: z.string().min(1),
        company: z.string().min(1),
        type: z.enum(["Job", "Internship", "Freelance", "Guidance"]),
        location: z.string().min(1),
        description: z.string().min(1),
        link: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const batchRecord = await getOrCreateCommunityBatch();

      const [newCareer] = await db
        .insert(communityCareers)
        .values({
          ...input,
          publishedBy: ctx.user.id,
        })
        .returning();

      // Notify community members about new job opportunities
      const enrollments = await db.query.batchEnrollments.findMany({
        where: and(
          eq(batchEnrollments.batchId, batchRecord.id),
          eq(batchEnrollments.status, "active")
        ),
        columns: { studentId: true },
      });
      const memberIds = enrollments.map((e) => e.studentId);

      if (memberIds.length > 0) {
        await sendBulkNotification(
          memberIds,
          "New Career Opportunity Published",
          `A new ${input.type} opportunity "${input.title}" at ${input.company} is now available.`,
          "community_career"
        );
      }

      return newCareer;
    }),

  deleteCareer: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(communityCareers).where(eq(communityCareers.id, input.id));
      return { success: true };
    }),

  saveCareer: authedQuery
    .input(z.object({ careerId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const existing = await db.query.communitySavedCareers.findFirst({
        where: and(
          eq(communitySavedCareers.careerId, input.careerId),
          eq(communitySavedCareers.userId, ctx.user.id)
        ),
      });

      if (existing) {
        await db
          .delete(communitySavedCareers)
          .where(eq(communitySavedCareers.id, existing.id));
        return { saved: false };
      } else {
        await db.insert(communitySavedCareers).values({
          careerId: input.careerId,
          userId: ctx.user.id,
        });
        return { saved: true };
      }
    }),

  listSavedCareers: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const saved = await db.query.communitySavedCareers.findMany({
      where: eq(communitySavedCareers.userId, ctx.user.id),
      with: {
        career: true,
      },
      orderBy: desc(communitySavedCareers.createdAt),
    });
    return saved.map((s) => s.career);
  }),

  // Student Success Stories
  listSuccessStories: authedQuery.query(async () => {
    const db = getDb();
    return db.query.communitySuccessStories.findMany({
      orderBy: desc(communitySuccessStories.createdAt),
    });
  }),

  createSuccessStory: adminQuery
    .input(
      z.object({
        studentName: z.string().min(1),
        courseCompleted: z.string().min(1),
        achievement: z.string().min(1),
        photoUrl: z.string().optional(),
        testimonial: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const [newStory] = await db
        .insert(communitySuccessStories)
        .values({
          ...input,
          publishedBy: ctx.user.id,
        })
        .returning();
      return newStory;
    }),

  deleteSuccessStory: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(communitySuccessStories).where(eq(communitySuccessStories.id, input.id));
      return { success: true };
    }),

  // Schedule Community Live Session (bypasses regular teacher constraints)
  scheduleLiveSession: teacherQuery
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        scheduledAt: z.date(),
        duration: z.number().default(60),
        teacherId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const batchRecord = await getOrCreateCommunityBatch();

      const slug = input.title
        .replace(/[^a-zA-Z0-9]/g, "-")
        .toLowerCase()
        .substring(0, 50);
      const roomName = `emtees-${slug}-${crypto.randomUUID().substring(0, 8)}`;

      const [newClass] = await db
        .insert(classes)
        .values({
          title: input.title,
          description: input.description,
          scheduledAt: input.scheduledAt,
          duration: input.duration,
          teacherId: input.teacherId,
          batchId: batchRecord.id,
          classType: "group",
          status: "scheduled",
          meetingRoomId: roomName,
          meetingUrl: `https://meet.jit.si/${roomName}`,
        })
        .returning();

      // Create class Batches record
      await db.insert(classBatches).values({
        classId: newClass.id,
        batchId: batchRecord.id,
      });

      // Notify community members about upcoming live sessions
      const enrollments = await db.query.batchEnrollments.findMany({
        where: and(
          eq(batchEnrollments.batchId, batchRecord.id),
          eq(batchEnrollments.status, "active")
        ),
        columns: { studentId: true },
      });
      const memberIds = enrollments.map((e) => e.studentId);

      if (memberIds.length > 0) {
        await sendBulkNotification(
          memberIds,
          "Upcoming Live Session Scheduled",
          `A live session titled "${input.title}" has been scheduled for ${new Date(
            input.scheduledAt
          ).toLocaleString()}.`,
          "community_live_session"
        );
      }

      return newClass;
    }),

  // Analytics
  getAnalytics: adminQuery.query(async () => {
    const db = getDb();
    const batchRecord = await getOrCreateCommunityBatch();

    // 1. Total community members
    const membersCountRes = await db
      .select({ count: sql<number>`count(*)` })
      .from(batchEnrollments)
      .where(
        and(
          eq(batchEnrollments.batchId, batchRecord.id),
          eq(batchEnrollments.status, "active")
        )
      );
    const totalMembers = Number(membersCountRes[0]?.count || 0);

    // 2. Daily Active Users (DAU) trend for last 7 days
    const activeTrend = await db
      .select({
        activeDate: communityActiveUsers.activeDate,
        count: sql<number>`count(distinct ${communityActiveUsers.userId})`,
      })
      .from(communityActiveUsers)
      .groupBy(communityActiveUsers.activeDate)
      .orderBy(desc(communityActiveUsers.activeDate))
      .limit(7);

    // 3. Lesson views counts
    const lessonViews = await db
      .select({
        lessonId: communityLessonViews.lessonId,
        viewsCount: sql<number>`count(*)`,
        lessonTitle: communityLessons.title,
      })
      .from(communityLessonViews)
      .innerJoin(communityLessons, eq(communityLessons.id, communityLessonViews.lessonId))
      .groupBy(communityLessonViews.lessonId, communityLessons.title)
      .orderBy(desc(sql`viewsCount`));

    // 4. Discussion Forum activity (Total Posts & Total Comments)
    const totalPostsRes = await db.select({ count: sql<number>`count(*)` }).from(communityPosts);
    const totalCommentsRes = await db.select({ count: sql<number>`count(*)` }).from(communityComments);
    
    // 5. Live sessions attendance count
    const liveClasses = await db
      .select({ id: classes.id })
      .from(classes)
      .where(eq(classes.batchId, batchRecord.id));
    
    const liveClassIds = liveClasses.map((c) => c.id);
    let totalPresentAttendance = 0;
    if (liveClassIds.length > 0) {
      const attendanceRes = await db
        .select({ count: sql<number>`count(*)` })
        .from(attendance)
        .where(
          and(
            inArray(attendance.classId, liveClassIds),
            eq(attendance.status, "present")
          )
        );
      totalPresentAttendance = Number(attendanceRes[0]?.count || 0);
    }

    // 6. Most Engaged Members: sum of posts + comments + views
    // First, get all users from community batch
    const communityStudents = await db
      .select({
        id: users.id,
        name: users.name,
      })
      .from(users)
      .innerJoin(batchEnrollments, eq(batchEnrollments.studentId, users.id))
      .where(
        and(
          eq(batchEnrollments.batchId, batchRecord.id),
          eq(batchEnrollments.status, "active")
        )
      );

    const postCounts = await db
      .select({ authorId: communityPosts.authorId, count: sql<number>`count(*)` })
      .from(communityPosts)
      .groupBy(communityPosts.authorId);

    const commentCounts = await db
      .select({ authorId: communityComments.authorId, count: sql<number>`count(*)` })
      .from(communityComments)
      .groupBy(communityComments.authorId);

    const viewCounts = await db
      .select({ userId: communityLessonViews.userId, count: sql<number>`count(*)` })
      .from(communityLessonViews)
      .groupBy(communityLessonViews.userId);

    const postsMap = new Map(postCounts.map((c) => [c.authorId, Number(c.count)]));
    const commentsMap = new Map(commentCounts.map((c) => [c.authorId, Number(c.count)]));
    const viewsMap = new Map(viewCounts.map((c) => [c.userId, Number(c.count)]));

    const engagedMembers = communityStudents.map((s) => {
      const p = postsMap.get(s.id) || 0;
      const c = commentsMap.get(s.id) || 0;
      const v = viewsMap.get(s.id) || 0;
      return {
        id: s.id,
        name: s.name,
        score: p * 5 + c * 3 + v * 1, // weight post 5, comment 3, view 1
        postsCount: p,
        commentsCount: c,
        viewsCount: v,
      };
    }).sort((a, b) => b.score - a.score).slice(0, 10);

    return {
      totalMembers,
      activeTrend: activeTrend.reverse(),
      lessonViews,
      discussionActivity: {
        posts: Number(totalPostsRes[0]?.count || 0),
        comments: Number(totalCommentsRes[0]?.count || 0),
      },
      liveSessionAttendance: {
        totalClasses: liveClassIds.length,
        totalPresentAttendance,
      },
      engagedMembers,
    };
  }),
});
