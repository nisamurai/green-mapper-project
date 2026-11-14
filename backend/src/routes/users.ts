import { authMiddleware } from "@/middleware/auth";
import Elysia, { t } from "elysia";
import * as schema from "@/db/schema";
import { eq, ilike, or } from "drizzle-orm";
import { db } from "@/db/db";
import {UserRoles} from "@/db/schema"
export const usersRouter = new Elysia({ prefix: "/users" })
  .use(authMiddleware)
  .get(
    "/me",
    async ({ user }) => {
      const fullUser = await db.query.user.findFirst({
        where: eq(schema.user.id, user.id),
        columns: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          image: true,
          createdAt: true,
          updatedAt: true,
          points: true,
          role: true,
          twoFactorEnabled: true,
          hasAccessToMatureContent: true,
        },
      });
      return fullUser;
    },
    { auth: true },
  )
  .get(
    "/all",
    async ({ query, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      if (user.role !== "superAdmin") {
        set.status = 403;
        return { error: "Forbidden" };
      }

      const { limit, skip, searchParam } = query;

      const searchCondition = searchParam
        ? or(
            ilike(schema.user.name, `%${searchParam}%`),
            ilike(schema.user.email, `%${searchParam}%`),
          )
        : undefined;

      const users = await db.query.user.findMany({
        where: searchCondition,
        columns: {
          id: true,
          name: true,
          email: true,
          role: true,
          hasAccessToMatureContent: true,
        },
        limit: limit ?? undefined,
        offset: limit !== undefined ? (skip ?? 0) : undefined,
        orderBy: (user, { asc }) => [asc(user.id)],
      });

      return users;
    },
    {
      auth: true,
      query: t.Object({
        limit: t.Optional(
          t.Numeric({
            minimum: 0,
            description: "Number of items to return (if omitted, returns all)",
          }),
        ),
        skip: t.Optional(
          t.Numeric({
            minimum: 0,
            description: "Number of items to skip (only used with limit)",
          }),
        ),
        searchParam: t.Optional(
          t.String({
            description:
              "Return users whose username or email contains this param",
          }),
        ),
      }),
    },
  );
