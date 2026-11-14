import { db } from "@/db/db";
import { authMiddleware } from "@/middleware/auth";
import Elysia, { t } from "elysia";
import * as schema from "@/db/schema";
import { and, gte, lte, sql, eq, or, ne, desc } from "drizzle-orm";
import { issueService } from "@/issues/adapters";
import {
  ADDRESS_MAX,
  DETAILED_DESCRIPTION_MAX,
  SHORT_DESCRIPTION_MAX,
  STATUS,
  canViewIssue,
  describeListVisibility,
} from "@/issues/issue-rules";

const createReportBody = t.Object({
  latitude: t.String(),
  longitude: t.String(),
  typeId: t.Numeric(),
  shortDescription: t.String({ minLength: 1, maxLength: SHORT_DESCRIPTION_MAX }),
  detailedDescription: t.Optional(
    t.String({ maxLength: DETAILED_DESCRIPTION_MAX }),
  ),
  address: t.String({ minLength: 1, maxLength: ADDRESS_MAX }),
  files: t.Optional(t.Files()),
});

export const reportsRouter = new Elysia({ prefix: "/reports" })
  .use(authMiddleware)
  .get(
    "/issue-types",
    async () => {
      // Запрос для получения списка типов заявок
      return db.select().from(schema.issueTypes);
    },
    { auth: true },
  )
  .post(
    "/",
    async ({ body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const result = await issueService.createReport({
        userId: user.id,
        latitude: body.latitude,
        longitude: body.longitude,
        typeId: body.typeId,
        shortDescription: body.shortDescription,
        detailedDescription: body.detailedDescription,
        address: body.address,
        files: body.files
          ? Array.isArray(body.files)
            ? body.files
            : [body.files]
          : undefined,
      });
      set.status = result.status;
      if (!result.ok) return { error: result.error };
      return result.data;
    },
    {
      body: createReportBody,
      auth: true,
    },
  );
