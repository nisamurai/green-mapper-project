import type { llmOutcome } from "./issue-rules";

export type UploadFile = {
	name: string;
	type: string;
	size: number;
	arrayBuffer(): Promise<ArrayBuffer>;
};

export type Clock = {
	now(): Date;
};

export type IdGenerator = {
	next(): string;
};

export type StoredIssue = {
	issueId: number;
	userId: string;
	statusId: number;
	matureContent: boolean;
	createdAt: Date | null;
	authorPoints: number;
};

export type LlmOutcome = ReturnType<typeof llmOutcome>;

export type ContentScanner = {
	scan(issue: StoredIssue, files: Uint8Array[]): Promise<{
		verified: boolean;
		message: string;
	}>;
};

export interface IssueRepository {
	findIssue(id: number): Promise<StoredIssue | null>;
	statusExists(statusId: number): Promise<boolean>;
	createIssue(input: {
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
	}): Promise<Record<string, unknown>>;
	changeStatus(
		id: number,
		statusId: number,
		userId: string,
		pointsDelta: number,
	): Promise<void>;
	deleteIssue(
		id: number,
		pointsDelta: number,
		storage: ObjectStorage,
	): Promise<{ issueId: number } | null>;
	applyLlm(id: number, outcome: LlmOutcome): Promise<boolean>;
}

export interface ObjectStorage {
	putFiles(
		files: UploadFile[],
		issueId: number,
		ids: IdGenerator,
	): Promise<string[]>;
	removeFiles(paths: string[]): Promise<void>;
}

export interface IssueQueue {
	notifyCreated(issue: { issueId: number; createdAt: Date }): Promise<void>;
}
