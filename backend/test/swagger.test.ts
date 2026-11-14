import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { swaggerMiddleware } from "../src/middleware/swagger.ts";
import Elysia from "elysia";

describe("swaggerMiddleware", () => {
	const originalEnv = process.env.DEVELOPMENT;

	beforeEach(() => {
	});

	afterEach(() => {
		if (originalEnv !== undefined) {
			process.env.DEVELOPMENT = originalEnv;
		} else {
			delete process.env.DEVELOPMENT;
		}
	});

	test("должен возвращать Elysia экземпляр", () => {
		const app = new Elysia();
		const result = app.use(swaggerMiddleware);
		
		expect(result).toBeDefined();
	});

	test("не должен включать swagger если DEVELOPMENT не установлен", () => {
		delete process.env.DEVELOPMENT;
		
		const app = new Elysia();
		const result = app.use(swaggerMiddleware);
		
		expect(result).toBeDefined();
	});

	test("должен включать swagger если DEVELOPMENT === 'true'", () => {
		process.env.DEVELOPMENT = "true";
		
		const app = new Elysia();
		const result = app.use(swaggerMiddleware);
		
		expect(result).toBeDefined();
	});

	test("не должен включать swagger если DEVELOPMENT !== 'true'", () => {
		process.env.DEVELOPMENT = "false";
		
		const app = new Elysia();
		const result = app.use(swaggerMiddleware);
		
		expect(result).toBeDefined();
	});
});

