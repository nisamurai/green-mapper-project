import { describe, expect, test, beforeEach, vi } from "vitest";
import { fetcher } from "../lib/fetcher";

global.fetch = vi.fn();

const createMockResponse = (jsonData: unknown) => ({
	json: vi.fn().mockResolvedValue(jsonData),
	ok: true,
	status: 200,
	statusText: "OK",
	headers: new Headers(),
	redirected: false,
	type: "basic" as ResponseType,
	url: "",
	clone: vi.fn(),
	body: null,
	bodyUsed: false,
	arrayBuffer: vi.fn(),
	blob: vi.fn(),
	formData: vi.fn(),
	text: vi.fn(),
}) as unknown as Response;

describe("fetcher", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv("VITE_API_BASE_URL", "http://localhost:3000");
	});

	test("должен вызывать fetch с правильным URL", async () => {
		const mockResponse = createMockResponse({ data: "test" });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
			mockResponse,
		);

		const url = new URL("/api/test", "http://localhost:5173");
		await fetcher(url.pathname, {});

		expect(global.fetch).toHaveBeenCalled();
		const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(callArgs[0]).toContain("/api/test");
		expect(callArgs[1]).toMatchObject({
			credentials: "include",
		});
	});

	test("должен включать credentials в запрос", async () => {
		const mockResponse = createMockResponse({ data: "test" });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
			mockResponse,
		);

		const url = new URL("/api/test", "http://localhost:5173");
		await fetcher(url.pathname, {});

		expect(global.fetch).toHaveBeenCalled();
		const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(callArgs[1]).toMatchObject({
			credentials: "include",
		});
	});

	test("должен передавать init параметры в fetch", async () => {
		const mockResponse = createMockResponse({ data: "test" });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
			mockResponse,
		);

		const url = new URL("/api/test", "http://localhost:5173");
		const init: RequestInit = {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ test: "data" }),
		};

		await fetcher(url.pathname, init);

		expect(global.fetch).toHaveBeenCalled();
		const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(callArgs[1]).toMatchObject({
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ test: "data" }),
			credentials: "include",
		});
	});

	test("должен возвращать распарсенный JSON", async () => {
		const mockData = { data: "test", id: 1 };
		const mockResponse = createMockResponse(mockData);
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
			mockResponse,
		);

		const url = new URL("/api/test", "http://localhost:5173");
		const result = await fetcher(url.pathname, {});

		expect(result).toEqual(mockData);
	});

	test("должен объединять credentials с переданными init параметрами", async () => {
		const mockResponse = createMockResponse({});
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
			mockResponse,
		);

		const url = new URL("/api/test", "http://localhost:5173");
		await fetcher(url.pathname, {
			credentials: "omit",
		});

		expect(global.fetch).toHaveBeenCalled();
		const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(callArgs[1]).toMatchObject({
			credentials: "include",
		});
	});
});

