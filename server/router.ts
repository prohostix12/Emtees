import { createRouter, publicQuery } from "./middleware";
import { authRouter } from "./routers/auth";
import { userRouter } from "./routers/users";
import { learningRouter } from "./routers/learning";
import { classRouter } from "./routers/classes";
import { adminRouter } from "./routers/admin";
import { studentRouter } from "./routers/student";
import { privateMessageRouter } from "./routers/privateMessages";
import { notificationRouter } from "./routers/notifications";
import { communityRouter } from "./routers/community";
import { disciplineRouter } from "./routers/discipline";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  user: userRouter,
  learning: learningRouter,
  class: classRouter,
  admin: adminRouter,
  student: studentRouter,
  privateMessage: privateMessageRouter,
  notification: notificationRouter,
  community: communityRouter,
  discipline: disciplineRouter,
});

export type AppRouter = typeof appRouter;
