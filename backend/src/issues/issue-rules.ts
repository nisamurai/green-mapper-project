export const STATUS = {
	PROCESSING: 1,
	IN_WORK: 2,
	DONE: 3,
	REJECTED: 4,
	VALIDATION: 5,
} as const;

export const SHORT_DESCRIPTION_MAX = 200;
export const DETAILED_DESCRIPTION_MAX = 1000;
export const ADDRESS_MAX = 255;
export const MAX_FILES_COUNT = 3;
export const MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

const STAFF_ROLES = new Set(["admin", "operator", "superAdmin"]);

export type Viewer = {
	id?: string;
	role?: string | null;
	hasAccessToMatureContent?: boolean;
};

export type IssueVisibility = {
	statusId: number;
	userId: string;
	matureContent: boolean;
};

export type ListQuery = {
	showMyOnly: boolean;
	showMatureOnly: boolean;
};

export type ListVisibility = {
	restrictToUserId?: string;
	includeOwnUserId?: string;
	hideValidationFromOthers: boolean;
	hideMatureFromOthers: boolean;
	onlyMature: boolean;
};

export function validateIssueText(input: {
	shortDescription: string;
	detailedDescription?: string;
	address: string;
}): string | null {
	if (
		input.shortDescription.trim().length === 0 ||
		input.shortDescription.length > SHORT_DESCRIPTION_MAX
	) {
		return `Short description must be 1-${SHORT_DESCRIPTION_MAX} characters`;
	}
	if (
		input.address.trim().length === 0 ||
		input.address.length > ADDRESS_MAX
	) {
		return `Address must be 1-${ADDRESS_MAX} characters`;
	}
	if (
		input.detailedDescription !== undefined &&
		input.detailedDescription.length > DETAILED_DESCRIPTION_MAX
	) {
		return `Detailed description must be at most ${DETAILED_DESCRIPTION_MAX} characters`;
	}
	return null;
}

export function validateIssueFiles(
	files: { name: string; type: string; size: number }[] | undefined,
): { ok: true } | { ok: false; error: string } {
	if (!files || files.length === 0) return { ok: true };
	if (files.length > MAX_FILES_COUNT) {
		return { ok: false, error: "To much files" };
	}
	const invalidType = files.find(
		(file) => !ALLOWED_IMAGE_MIME_TYPES.has(file.type),
	);
	if (invalidType) {
		return {
			ok: false,
			error: `file '${invalidType.name}' should be jpg or png`,
		};
	}
	const oversized = files.find((file) => file.size > MAX_FILE_SIZE_BYTES);
	if (oversized) {
		return { ok: false, error: `file '${oversized.name}' exceeds 3 MB` };
	}
	return { ok: true };
}

export function canViewIssue(
	issue: IssueVisibility,
	viewer: Viewer | null | undefined,
	isService = false,
): boolean {
	if (isService) return true;
	const isAuthor = !!viewer?.id && viewer.id === issue.userId;
	if (issue.statusId === STATUS.VALIDATION && !isAuthor) return false;
	if (issue.matureContent && !isAuthor && !viewer?.hasAccessToMatureContent) {
		return false;
	}
	return true;
}

export function describeListVisibility(
	viewer: Viewer | null | undefined,
	query: ListQuery,
): ListVisibility {
	const hasAccess = !!viewer?.hasAccessToMatureContent;
	const onlyMature = hasAccess && query.showMatureOnly;
	if (query.showMyOnly && viewer?.id) {
		return {
			restrictToUserId: viewer.id,
			hideValidationFromOthers: false,
			hideMatureFromOthers: false,
			onlyMature,
		};
	}
	return {
		includeOwnUserId: viewer?.id,
		hideValidationFromOthers: true,
		hideMatureFromOthers: !hasAccess,
		onlyMature,
	};
}

export function isIssueVisibleInList(
	issue: IssueVisibility,
	viewer: Viewer | null | undefined,
	query: ListQuery,
): boolean {
	const policy = describeListVisibility(viewer, query);
	const isAuthor = !!viewer?.id && viewer.id === issue.userId;
	if (policy.restrictToUserId) {
		if (issue.userId !== policy.restrictToUserId) return false;
		if (policy.onlyMature && !issue.matureContent) return false;
		return true;
	}
	if (isAuthor && policy.includeOwnUserId) {
		if (policy.onlyMature && !issue.matureContent) return false;
		return true;
	}
	if (policy.hideValidationFromOthers && issue.statusId === STATUS.VALIDATION) {
		return false;
	}
	if (policy.hideMatureFromOthers && issue.matureContent) return false;
	if (policy.onlyMature && !issue.matureContent) return false;
	return true;
}

export function decideStatusTransition(input: {
	role: string | null | undefined;
	fromStatusId: number;
	toStatusId: number;
}): { allowed: boolean; pointsDelta: number } {
	const { role, fromStatusId, toStatusId } = input;
	if (!role || !STAFF_ROLES.has(role)) {
		return { allowed: false, pointsDelta: 0 };
	}
	const isAdminLike = role === "admin" || role === "superAdmin";

	if (
		toStatusId === STATUS.IN_WORK &&
		fromStatusId === STATUS.PROCESSING &&
		isAdminLike
	) {
		return { allowed: true, pointsDelta: 0 };
	}
	if (
		toStatusId === STATUS.REJECTED &&
		(fromStatusId === STATUS.PROCESSING || fromStatusId === STATUS.IN_WORK)
	) {
		return { allowed: true, pointsDelta: -1 };
	}
	if (
		toStatusId === STATUS.DONE &&
		fromStatusId === STATUS.IN_WORK &&
		role === "operator"
	) {
		return { allowed: true, pointsDelta: 0 };
	}
	if (toStatusId === STATUS.PROCESSING && fromStatusId !== STATUS.PROCESSING && isAdminLike) {
		return { allowed: true, pointsDelta: 0 };
	}
	return { allowed: false, pointsDelta: 0 };
}

export function decideDelete(
	role: string | null | undefined,
	statusId: number,
): { allowed: boolean; pointsDelta: number } {
	if (!role || !STAFF_ROLES.has(role)) {
		return { allowed: false, pointsDelta: 0 };
	}
	if (statusId === STATUS.DONE || statusId === STATUS.REJECTED) {
		return { allowed: true, pointsDelta: -1 };
	}
	return { allowed: false, pointsDelta: 0 };
}

export function llmOutcome(verified: boolean): {
	statusId: number;
	matureContent: boolean;
	pointsDelta: number;
} {
	return {
		statusId: STATUS.PROCESSING,
		matureContent: !verified,
		pointsDelta: 0,
	};
}
