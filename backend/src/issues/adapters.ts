import { db } from "@/db/db";
import * as schema from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { rabbitMQ } from "@/utils/rabbitmq";
import {
	putIntoBucketMultiple,
	removeFromBucketMultiple,
} from "@/utils/minio";
import { STATUS } from "./issue-rules";
import {
	IssuePersistError,
	IssueService,
	IssueTypeMissingError,
} from "./issue-service";
import type {
	Clock,
	IdGenerator,
	IssueQueue,
	IssueRepository,
	ObjectStorage,
	StoredIssue,
	UploadFile,
} from "./ports";
import type { LlmOutcome } from "./ports";

export const systemClock: Clock = {
	now: () => new Date(),
};

export const randomIdGenerator: IdGenerator = {
	next: () => crypto.randomUUID(),
};

export class MinioObjectStorage implements ObjectStorage {
	async putFiles(files: UploadFile[], issueId: number, ids: IdGenerator) {
		return putIntoBucketMultiple(
			files as File[],
			issueId,
			undefined,
			"report_photos",
			() => ids.next(),
		);
	}

	async removeFiles(paths: string[]) {
		await removeFromBucketMultiple(paths);
	}
}

export class RabbitIssueQueue implements IssueQueue {
	async notifyCreated(issue: { issueId: number; createdAt: Date }) {
		await rabbitMQ.notifyIssueCreated(issue);
	}
}

function toStoredIssue(row: {
	issueId: number;
	userId: string;
	statusId: number;
	matureContent: boolean;
	createdAt: Date | null;
	authorPoints?: number | null;
}): StoredIssue {
	return {
		issueId: row.issueId,
		userId: row.userId,
		statusId: row.statusId,
		matureContent: row.matureContent,
		createdAt: row.createdAt,
		authorPoints: row.authorPoints ?? 0,
	};
}

export class DrizzleIssueRepository implements IssueRepository {
	async findIssue(id: number): Promise<StoredIssue | null> {
		const row = await db
			.select({
				issueId: schema.issues.issueId,
				userId: schema.issues.userId,
				statusId: schema.issues.statusId,
				matureContent: schema.issues.matureContent,
				createdAt: schema.issues.createdAt,
				authorPoints: schema.user.points,
			})
			.from(schema.issues)
			.leftJoin(schema.user, eq(schema.issues.userId, schema.user.id))
			.where(eq(schema.issues.issueId, id))
			.limit(1);
		return row[0] ? toStoredIssue(row[0]) : null;
	}

	async statusExists(statusId: number) {
		const status = await db.query.issueStatuses.findFirst({
			where: eq(schema.issueStatuses.statusId, statusId),
		});
		return !!status;
	}

	async createIssue(input: {
		userId: string;
		latitude: string;
		longitude: string;
		typeId: number;
		shortDescription: string;
		detailedDescription?: string;
		address: string;
		files?: UploadFile[];
		clock: Clock;
		ids: IdGenerator;
		storage: ObjectStorage;
	}): Promise<Record<string, unknown>> {
		return db.transaction(async (tx) => {
			const issueType = await tx.query.issueTypes.findFirst({
				where: eq(schema.issueTypes.typeId, input.typeId),
			});
			if (!issueType) {
				throw new IssueTypeMissingError(input.typeId);
			}

			const createdAt = input.clock.now();
			const newIssue = await tx
				.insert(schema.issues)
				.values({
					userId: input.userId,
					typeId: input.typeId,
					statusId: STATUS.VALIDATION,
					shortDescription: input.shortDescription,
					detailedDescription: input.detailedDescription,
					address: input.address,
					latitude: input.latitude,
					longitude: input.longitude,
					createdAt,
				})
				.returning();

			if (newIssue.length === 0) {
				throw new IssuePersistError();
			}

			if (input.files && input.files.length > 0) {
				const paths = await input.storage.putFiles(
					input.files,
					newIssue[0].issueId,
					input.ids,
				);
				const newPhotos = await tx
					.insert(schema.photos)
					.values(
						paths.map((path) => ({
							issueId: newIssue[0].issueId,
							filePath: path,
							uploadedAt: input.clock.now(),
						})),
					)
					.returning();
				if (newPhotos.length !== paths.length) {
					await input.storage.removeFiles(newPhotos.map((photo) => photo.filePath));
					throw new IssuePersistError();
				}
			}

			await tx
				.update(schema.user)
				.set({ points: sql`${schema.user.points} + 1` })
				.where(eq(schema.user.id, input.userId));

			return newIssue[0] as Record<string, unknown>;
		});
	}

	async changeStatus(
		id: number,
		statusId: number,
		userId: string,
		pointsDelta: number,
	) {
		await db.transaction(async (tx) => {
			await tx
				.update(schema.issues)
				.set({ statusId })
				.where(eq(schema.issues.issueId, id));
			if (pointsDelta < 0) {
				await tx
					.update(schema.user)
					.set({ points: sql`GREATEST(${schema.user.points} - 1, 0)` })
					.where(eq(schema.user.id, userId));
			}
		});
	}

	async deleteIssue(id: number, pointsDelta: number, storage: ObjectStorage) {
		return db.transaction(async (tx) => {
			const existing = await tx.query.issues.findFirst({
				where: eq(schema.issues.issueId, id),
				columns: { issueId: true, userId: true },
			});
			if (!existing) return null;

			const pictures = await tx
				.delete(schema.photos)
				.where(eq(schema.photos.issueId, id))
				.returning({ link: schema.photos.filePath });
			await storage.removeFiles(pictures.map((picture) => picture.link));

			const deleted = await tx
				.delete(schema.issues)
				.where(eq(schema.issues.issueId, id))
				.returning({ issueId: schema.issues.issueId, userId: schema.issues.userId });
			if (deleted.length === 0) return null;

			if (pointsDelta < 0) {
				await tx
					.update(schema.user)
					.set({ points: sql`GREATEST(${schema.user.points} - 1, 0)` })
					.where(eq(schema.user.id, deleted[0].userId));
			}
			return { issueId: deleted[0].issueId };
		});
	}

	async applyLlm(id: number, outcome: LlmOutcome) {
		const updated = await db
			.update(schema.issues)
			.set({
				matureContent: outcome.matureContent,
				statusId: outcome.statusId,
			})
			.where(eq(schema.issues.issueId, id))
			.returning({ issueId: schema.issues.issueId });
		return updated.length > 0;
	}
}

export const issueService = new IssueService(
	new DrizzleIssueRepository(),
	new MinioObjectStorage(),
	new RabbitIssueQueue(),
	systemClock,
	randomIdGenerator,
);
