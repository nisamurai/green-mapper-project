import { describe, expect, test } from "bun:test";
import { moderateIssue } from "../src/issues/issue-service.ts";
import { STATUS } from "../src/issues/issue-rules.ts";
import type { StoredIssue } from "../src/issues/ports.ts";
import { resetOtpSendReservations, tryReserveOtpSend } from "../src/utils/otp-cooldown.ts";

describe("модерация без модели", () => {
	test("отказ заглушки оставляет заявку в обработке с тем же баллом", async () => {
		const issue: StoredIssue = {
			issueId: 11,
			userId: "author",
			statusId: STATUS.VALIDATION,
			matureContent: false,
			createdAt: new Date("2026-01-01T00:00:00Z"),
			authorPoints: 4,
		};
		let stored = { ...issue };
		const calls: string[] = [];
		const result = await moderateIssue({
			issue,
			files: [],
			authorPoints: issue.authorPoints,
			scanner: {
				async scan() {
					calls.push("stub");
					return { verified: false, message: "no" };
				},
			},
			repo: {
				async applyLlm(_id, outcome) {
					stored = {
						...stored,
						statusId: outcome.statusId,
						matureContent: outcome.matureContent,
					};
					return true;
				},
			},
		});

		expect(calls).toEqual(["stub"]);
		expect(stored.statusId).toBe(STATUS.PROCESSING);
		expect(stored.matureContent).toBe(true);
		expect(result.authorPoints).toBe(4);
		expect(stored.authorPoints).toBe(4);
	});
});

describe("повтор кода", () => {
	test("второй запрос раньше 60 секунд не резервирует отправку", () => {
		resetOtpSendReservations();
		const now = 1_000_000;
		expect(tryReserveOtpSend("user:1", now).ok).toBe(true);
		const second = tryReserveOtpSend("user:1", now + 59_000);
		expect(second.ok).toBe(false);
		if (!second.ok) expect(second.retryAfterSeconds).toBe(1);
		expect(tryReserveOtpSend("user:1", now + 60_000).ok).toBe(true);
	});
});
