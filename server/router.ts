import { createRouter, publicQuery } from "./middleware";
import { authRouter } from "./routers/auth";
import { userRouter } from "./routers/users";
import { learningRouter } from "./routers/learning";
import { classRouter } from "./routers/classes";
import { adminRouter } from "./routers/admin";
import { studentRouter } from "./routers/student";
import { privateMessageRouter } from "./routers/privateMessages";
import { notificationRouter } from "./routers/notifications";

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
});

export type AppRouter = typeof appRouter;
