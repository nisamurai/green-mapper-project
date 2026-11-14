import {
	decideDelete,
	decideStatusTransition,
	llmOutcome,
	validateIssueFiles,
	validateIssueText,
} from "./issue-rules";
import type {
	Clock,
	ContentScanner,
	IdGenerator,
	IssueQueue,
	IssueRepository,
	ObjectStorage,
	StoredIssue,
	UploadFile,
} from "./ports";

export class IssueTypeMissingError extends Error {
	constructor(typeId: number) {
		super(`Issue type with ID ${typeId} not found.`);
	}
}

export class IssuePersistError extends Error {
	constructor(message = "Failed to create report.") {
		super(message);
	}
}

export type ServiceFailure = {
	ok: false;
	status: number;
	error: string;
};

export type ServiceSuccess<T> = {
	ok: true;
	status: number;
	data: T;
};

export class IssueService {
	constructor(
		private readonly repo: IssueRepository,
		private readonly storage: ObjectStorage,
		private readonly queue: IssueQueue,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
	) {}

	async createReport(input: {
		userId: string;
		latitude: string;
		longitude: string;
		typeId: number;
		shortDescription: string;
		detailedDescription?: string;
		address: string;
		files?: UploadFile[];
	}): Promise<ServiceSuccess<Record<string, unknown>> | ServiceFailure> {
		const textError = validateIssueText(input);
		if (textError) return { ok: false, status: 400, error: textError };
		const files = validateIssueFiles(input.files);
		if (!files.ok) return { ok: false, status: 422, error: files.error };

		const detailed = input.detailedDescription?.trim();
		try {
			const issue = await this.repo.createIssue({
				...input,
				shortDescription: input.shortDescription.trim(),
				address: input.address.trim(),
				detailedDescription: detailed ? detailed : undefined,
				clock: this.clock,
				ids: this.ids,
				storage: this.storage,
			});
			const issueId = Number(issue.issueId);
			const createdAt =
				issue.createdAt instanceof Date
					? issue.createdAt
					: issue.createdAt
						? new Date(String(issue.createdAt))
						: this.clock.now();
			try {
				await this.queue.notifyCreated({ issueId, createdAt });
			} catch (queueError) {
				console.error("Failed to send message to queue:", queueError);
			}
			return { ok: true, status: 201, data: issue };
		} catch (error) {
			if (error instanceof IssueTypeMissingError) {
				return { ok: false, status: 400, error: error.message };
			}
			console.error("Error creating report and updating user points:", error);
			return { ok: false, status: 500, error: "Internal server error." };
		}
	}

	async changeStatus(input: {
		id: number;
		statusId: number;
		role: string | null | undefined;
	}): Promise<
		ServiceSuccess<{ issueId: number; statusId: number }> | ServiceFailure
	> {
		const existing = await this.repo.findIssue(input.id);
		if (!existing) {
			return {
				ok: false,
				status: 404,
				error: `Issue with ID ${input.id} not found.`,
			};
		}
		if (!(await this.repo.statusExists(input.statusId))) {
			return {
				ok: false,
				status: 400,
				error: `Status with ID ${input.statusId} not found.`,
			};
		}
		const decision = decideStatusTransition({
			role: input.role,
			fromStatusId: existing.statusId,
			toStatusId: input.statusId,
		});
		if (!decision.allowed) {
			return { ok: false, status: 403, error: "Forbidden" };
		}
		await this.repo.changeStatus(
			input.id,
			input.statusId,
			existing.userId,
			decision.pointsDelta,
		);
		return {
			ok: true,
			status: 200,
			data: { issueId: input.id, statusId: input.statusId },
		};
	}

	async deleteIssue(input: {
		id: number;
		role: string | null | undefined;
	}): Promise<ServiceSuccess<{ issueId: number }> | ServiceFailure> {
		const existing = await this.repo.findIssue(input.id);
		if (!existing) {
			return {
				ok: false,
				status: 404,
				error: `Issue with ID ${input.id} not found.`,
			};
		}
		const decision = decideDelete(input.role, existing.statusId);
		if (!decision.allowed) {
			return { ok: false, status: 403, error: "Forbidden" };
		}
		const deleted = await this.repo.deleteIssue(
			input.id,
			decision.pointsDelta,
			this.storage,
		);
		if (!deleted) {
			return {
				ok: false,
				status: 404,
				error: `Issue with ID ${input.id} not found.`,
			};
		}
		return { ok: true, status: 200, data: deleted };
	}

	async applyLlmAnswer(input: {
		id: number;
		matureContent: boolean;
	}): Promise<ServiceSuccess<{ issueId: number }> | ServiceFailure> {
		const existing = await this.repo.findIssue(input.id);
		if (!existing) {
			return {
				ok: false,
				status: 404,
				error: `Issue with ID ${input.id} not found.`,
			};
		}
		const outcome = llmOutcome(!input.matureContent);
		const updated = await this.repo.applyLlm(input.id, {
			...outcome,
			matureContent: input.matureContent,
		});
		if (!updated) {
			return {
				ok: false,
				status: 404,
				error: `Issue with ID ${input.id} not found.`,
			};
		}
		return { ok: true, status: 200, data: { issueId: input.id } };
	}
}

export async function moderateIssue(input: {
	issue: StoredIssue;
	files: Uint8Array[];
	scanner: ContentScanner;
	repo: Pick<IssueRepository, "applyLlm">;
	authorPoints: number;
}): Promise<{ authorPoints: number; verified: boolean }> {
	const answer = await input.scanner.scan(input.issue, input.files);
	const outcome = llmOutcome(answer.verified);
	await input.repo.applyLlm(input.issue.issueId, outcome);
	return { authorPoints: input.authorPoints, verified: answer.verified };
}
