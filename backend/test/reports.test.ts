import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { reportsRouter } from "../src/routes/reports.ts";
import Elysia from "elysia";
import { t } from "elysia";

describe("reportsRouter", () => {
	test("должен быть определен", () => {
		expect(reportsRouter).toBeDefined();
	});

	test("должен быть экземпляром Elysia", () => {
		expect(reportsRouter).toBeDefined();
		expect(reportsRouter.use).toBeDefined();
		expect(typeof reportsRouter.use).toBe("function");
	});

	test("должен иметь правильный префикс", () => {
		expect(reportsRouter).toBeDefined();
	});

	test("должен иметь валидацию для createReportBody", async () => {
		const createReportBody = t.Object({
			latitude: t.String(),
			longitude: t.String(),
			typeId: t.Number(),
			shortDescription: t.String(),
			detailedDescription: t.Optional(t.String()),
			address: t.String(),
		});

		expect(createReportBody).toBeDefined();
		expect(createReportBody.properties).toBeDefined();

		expect(createReportBody.properties.latitude).toBeDefined();
		expect(createReportBody.properties.longitude).toBeDefined();
		expect(createReportBody.properties.typeId).toBeDefined();
		expect(createReportBody.properties.shortDescription).toBeDefined();
		expect(createReportBody.properties.address).toBeDefined();

		expect(createReportBody.properties.detailedDescription).toBeDefined();
	});

	test("должен валидировать параметры для PUT /:id/status", () => {
		const updateStatusBody = t.Object({
			statusId: t.Number(),
		});

		expect(updateStatusBody).toBeDefined();
		expect(updateStatusBody.properties).toBeDefined();
		expect(updateStatusBody.properties.statusId).toBeDefined();

		expect(updateStatusBody.required).toContain("statusId");
	});

	test("должен валидировать параметры id для GET и DELETE", () => {
		const idParams = t.Object({ id: t.Number() });

		expect(idParams).toBeDefined();
		expect(idParams.properties).toBeDefined();
		expect(idParams.properties.id).toBeDefined();

		expect(idParams.required).toContain("id");
	});
});

