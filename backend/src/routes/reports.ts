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
  )
  .put(
    "/:id/status",
    async ({ params: { id }, body, user, set, serviceRequest }) => {
      if (serviceRequest) {
        set.status = 403;
        return { error: "Forbidden" };
      }
      const result = await issueService.changeStatus({
        id,
        statusId: body.statusId,
        role: user?.role,
      });
      set.status = result.status;
      if (!result.ok) return { error: result.error };
      return { success: true, issue: result.data };
    },
    {
      params: t.Object({ id: t.Number() }),
      body: t.Object({ statusId: t.Number() }),
      auth: true, // Требуется аутентификация
    },
  )
  .put(
    "/:id/expectedResolutionDate",
    async ({ params: { id }, body, user, set, serviceRequest }) => {
      // Проверяем, авторизован ли пользователь и является ли он админом
      if (
        !serviceRequest &&
        user?.role !== "admin" &&
        user?.role !== "operator" &&
        user?.role !== "superAdmin"
      ) {
        set.status = 403; // Forbidden
        return { error: "Forbidden" };
      }

      if (!id) {
        return {
          error: "Invalid request body. 'statusId' (number) is required.",
        };
      }

      try {
        const updatedIssue = await db.transaction(async (tx) => {
          const existingIssue = await tx.query.issues.findFirst({
            where: eq(schema.issues.issueId, id),
            columns: {
              issueId: true,
              statusId: true,
              userId: true,
            },
          });

          if (!existingIssue) {
            return null;
          }
          // Обновляем предполагаемую дату решения заявки по ID
          const updatedIssues = await tx
            .update(schema.issues)
            .set({
              expectedResolutionDate: body.expectedResolutionDate.toISOString(),
            })
            .where(eq(schema.issues.issueId, id))
            .returning();

          return updatedIssues[0];
        });

        if (!updatedIssue) {
          set.status = 404; // Not Found
          return { error: `Issue with ID ${id} not found.` };
        }

        set.status = 200; // OK
        return { success: true, issue: updatedIssue };
      } catch (error) {
        console.error(
          `Error updating resolution Date for issue with ID ${id}:`,
          error,
        );
        set.status = 500;
        return { error: "Internal server error." };
      }
    },
    {
      params: t.Object({ id: t.Number() }),
      body: t.Object({ expectedResolutionDate: t.Date() }),
      auth: true, // Требуется аутентификация
    },
  )
  .put(
    "/:id/matureContent",
    async ({ params: { id }, body, user, set, serviceRequest }) => {
      // Проверяем, авторизован ли пользователь и является ли он админом
      if (
        !serviceRequest &&
        user?.role !== "admin" &&
        user?.role !== "operator" &&
        user?.role !== "superAdmin"
      ) {
        set.status = 403; // Forbidden
        return { error: "Forbidden" };
      }

      if (!id) {
        return {
          error: "Invalid request body. 'statusId' (number) is required.",
        };
      }

      try {
        const updatedIssue = await db.transaction(async (tx) => {
          const existingIssue = await tx.query.issues.findFirst({
            where: eq(schema.issues.issueId, id),
            columns: {
              issueId: true,
              statusId: true,
              userId: true,
            },
          });

          if (!existingIssue) {
            return null;
          }
          // Обновляем тег заявки по ID
          const updatedIssues = await tx
            .update(schema.issues)
            .set({ matureContent: body.matureContent })
            .where(eq(schema.issues.issueId, id))
            .returning();

          return updatedIssues[0];
        });

        if (!updatedIssue) {
          set.status = 404; // Not Found
          return { error: `Issue with ID ${id} not found.` };
        }

        set.status = 200; // OK
        return { success: true, issue: updatedIssue };
      } catch (error) {
        console.error(
          `Error updating matureContent tag for issue with ID ${id}:`,
          error,
        );
        set.status = 500;
        return { error: "Internal server error." };
      }
    },
    {
      params: t.Object({ id: t.Number() }),
      body: t.Object({ matureContent: t.Boolean() }),
      auth: true, // Требуется аутентификация
    },
  );
