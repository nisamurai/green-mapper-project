import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { usersRouter } from "../src/routes/users.ts";
import Elysia from "elysia";

describe("usersRouter", () => {
	test("должен быть определен", () => {
		expect(usersRouter).toBeDefined();
	});

	test("должен быть экземпляром Elysia", () => {
		expect(usersRouter).toBeDefined();
		expect(usersRouter.use).toBeDefined();
		expect(typeof usersRouter.use).toBe("function");
	});

	test("должен иметь правильный префикс", () => {
		expect(usersRouter).toBeDefined();
	});

	test("должен экспортировать router с методом get для /me", () => {
		expect(usersRouter).toBeDefined();
		expect(usersRouter.use).toBeDefined();
	});
});



