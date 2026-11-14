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
    "/",
    async ({ query, user }) => {
      const {
        latitude,
        longitude,
        distance,
        limit,
        skip,
        userId,
        showMyOnly,
        showMatureOnly,
      } = query;

      const filters = [];
      const policy = describeListVisibility(user, {
        showMyOnly: !!showMyOnly,
        showMatureOnly: !!showMatureOnly,
      });

      if (policy.restrictToUserId) {
        const own = [eq(schema.issues.userId, policy.restrictToUserId)];
        if (policy.onlyMature) {
          own.push(eq(schema.issues.matureContent, true));
        }
        filters.push(and(...own));
      } else {
        const others = [ne(schema.issues.statusId, STATUS.VALIDATION)];
        if (policy.hideMatureFromOthers) {
          others.push(eq(schema.issues.matureContent, false));
        }
        if (policy.onlyMature) {
          others.push(eq(schema.issues.matureContent, true));
        }
        const othersFilter = and(...others);
        const visibility = policy.includeOwnUserId
          ? or(
              and(
                eq(schema.issues.userId, policy.includeOwnUserId),
                ...(policy.onlyMature
                  ? [eq(schema.issues.matureContent, true)]
                  : []),
              ),
              othersFilter,
            )
          : othersFilter;
        filters.push(
          userId ? and(visibility, eq(schema.issues.userId, userId)) : visibility,
        );
      }

      if (distance && distance > 0) {
        // Convert distance from kilometers to degrees (approximate)
        // 1 degree of latitude ≈ 111 km
        const latRange = distance / 111;

        if (latitude && !isNaN(latitude)) {
          filters.push(
            and(
              gte(schema.issues.latitude, (latitude - latRange).toString()),
              lte(schema.issues.latitude, (latitude + latRange).toString()),
            ),
          );
        }

        if (longitude && !isNaN(longitude)) {
          let lngRange = latRange;

          if (latitude && !isNaN(longitude)) {
            // Adjust longitude range based on latitude
            // cos(latitude in radians) * 111 km per degree at equator
            lngRange = distance / (111 * Math.cos((latitude * Math.PI) / 180));
          }
          const leftCond =
            longitude - lngRange < -180
              ? or(
                  gte(
                    schema.issues.longitude,
                    (longitude - lngRange).toString(),
                  ),
                  gte(
                    schema.issues.longitude,
                    (longitude - lngRange + 360).toString(),
                  ),
                )
              : gte(schema.issues.longitude, (longitude - lngRange).toString());

          const rightCond =
            longitude + lngRange > 180
              ? or(
                  lte(
                    schema.issues.longitude,
                    (longitude + lngRange).toString(),
                  ),
                  lte(
                    schema.issues.longitude,
                    (longitude + lngRange - 360).toString(),
                  ),
                )
              : lte(schema.issues.longitude, (longitude + lngRange).toString());
          filters.push(and(leftCond, rightCond));
        }
      }

      const queryBuilder = db
        .select({
          issueId: schema.issues.issueId,
          shortDescription: schema.issues.shortDescription,
          detailedDescription: schema.issues.detailedDescription,
          address: schema.issues.address,
          latitude: schema.issues.latitude,
          longitude: schema.issues.longitude,
          createdAt: schema.issues.createdAt,
          expectedResolutionDate: schema.issues.expectedResolutionDate,
          statusName: schema.issueStatuses.name,
          typeName: schema.issueTypes.name,
          userName: schema.user.name,
          userPoints: schema.user.points,
          statusId: schema.issues.statusId,
          matureContent: schema.issues.matureContent,
          userId: schema.issues.userId,
          links: sql<string[]>`(
                SELECT COALESCE(
                  json_agg(${schema.photos.filePath}),
                  '[]'::json
                )
                FROM ${schema.photos} 
                WHERE ${schema.photos.issueId} = ${schema.issues.issueId}
              )`,
        })
        .from(schema.issues)
        .leftJoin(schema.user, eq(schema.issues.userId, schema.user.id))
        .leftJoin(
          schema.issueStatuses,
          eq(schema.issues.statusId, schema.issueStatuses.statusId),
        )
        .leftJoin(
          schema.issueTypes,
          eq(schema.issues.typeId, schema.issueTypes.typeId),
        )
        .orderBy(desc(schema.issues.createdAt))
        .where(filters.length > 0 ? and(...filters) : undefined);

      // Apply pagination
      const paginatedQuery =
        limit !== undefined && limit !== null
          ? queryBuilder.limit(limit).offset(skip || 0)
          : queryBuilder;

      const reports = await paginatedQuery;

      return reports;
    },
    {
      auth: false,
      partialAuth: true,
      query: t.Object({
        latitude: t.Optional(t.Numeric()),
        longitude: t.Optional(t.Numeric()),
        distance: t.Optional(
          t.Numeric({
            description: "Distance in kilometers for bounding box",
          }),
        ),

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
        userId: t.Optional(
          t.String({
            description: "Filter by user ID",
          }),
        ),
        showMyOnly: t.Optional(
          t.Boolean({
            description: "Include my reports only. Ignored if unathenticated",
          }),
        ),
        showMatureOnly: t.Optional(
          t.Boolean({
            description:
              "Show only tasks with mature tag. Ignored if unathenticated or have no acceess to it",
          }),
        ),
      }),
    },
  )
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
