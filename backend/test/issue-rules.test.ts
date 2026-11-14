import { describe, expect, test } from "bun:test";
import { STATUS, canViewIssue, decideDelete, decideStatusTransition, isIssueVisibleInList, llmOutcome } from "../src/issues/issue-rules.ts";

const author = "author";
const other = "other";

describe("видимость заявки", () => {
	test("чужая заявка на валидации не видна", () => {
		expect(
			canViewIssue(
				{ statusId: STATUS.VALIDATION, userId: author, matureContent: false },
				{ id: other, role: "admin", hasAccessToMatureContent: true },
			),
		).toBe(false);
	});

	test("автор видит свою заявку на валидации", () => {
		expect(
			canViewIssue(
				{ statusId: STATUS.VALIDATION, userId: author, matureContent: true },
				{ id: author, role: "user", hasAccessToMatureContent: false },
			),
		).toBe(true);
	});

	test("чужой опасный контент скрыт без доступа и виден с доступом", () => {
		const issue = {
			statusId: STATUS.PROCESSING,
			userId: author,
			matureContent: true,
		};
		expect(
			canViewIssue(issue, { id: other, hasAccessToMatureContent: false }),
		).toBe(false);
		expect(
			canViewIssue(issue, { id: other, hasAccessToMatureContent: true }),
		).toBe(true);
	});

	test("в моих заявках видны свои, а фильтр опасных оставляет только их", () => {
		const own = {
			statusId: STATUS.VALIDATION,
			userId: author,
			matureContent: true,
		};
		const viewer = { id: author, hasAccessToMatureContent: true };
		expect(isIssueVisibleInList(own, viewer, { showMyOnly: true, showMatureOnly: false })).toBe(true);
		expect(isIssueVisibleInList(own, viewer, { showMyOnly: true, showMatureOnly: true })).toBe(true);
		expect(
			isIssueVisibleInList(
				{ ...own, matureContent: false },
				viewer,
				{ showMyOnly: true, showMatureOnly: true },
			),
		).toBe(false);
	});
});

describe("переходы и баллы", () => {
	test("в работу переводит только администратор или главный администратор", () => {
		expect(
			decideStatusTransition({
				role: "operator",
				fromStatusId: STATUS.PROCESSING,
				toStatusId: STATUS.IN_WORK,
			}).allowed,
		).toBe(false);
		expect(
			decideStatusTransition({
				role: "admin",
				fromStatusId: STATUS.PROCESSING,
				toStatusId: STATUS.IN_WORK,
			}),
		).toEqual({ allowed: true, pointsDelta: 0 });
	});

	test("выполнена доступна только оператору и не меняет балл", () => {
		expect(
			decideStatusTransition({
				role: "operator",
				fromStatusId: STATUS.IN_WORK,
				toStatusId: STATUS.DONE,
			}),
		).toEqual({ allowed: true, pointsDelta: 0 });
		expect(
			decideStatusTransition({
				role: "superAdmin",
				fromStatusId: STATUS.IN_WORK,
				toStatusId: STATUS.DONE,
			}).allowed,
		).toBe(false);
	});

	test("отклонение списывает балл, удаление только выполненной или отклонённой", () => {
		expect(
			decideStatusTransition({
				role: "operator",
				fromStatusId: STATUS.PROCESSING,
				toStatusId: STATUS.REJECTED,
			}),
		).toEqual({ allowed: true, pointsDelta: -1 });
		expect(decideDelete("admin", STATUS.DONE)).toEqual({
			allowed: true,
			pointsDelta: -1,
		});
		expect(decideDelete("admin", STATUS.PROCESSING).allowed).toBe(false);
	});

	test("отказ модели ставит обработку и опасный контент без списания балла", () => {
		expect(llmOutcome(false)).toEqual({
			statusId: STATUS.PROCESSING,
			matureContent: true,
			pointsDelta: 0,
		});
	});
});
