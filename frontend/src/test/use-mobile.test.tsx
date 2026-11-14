import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "../hooks/use-mobile";

describe("useIsMobile", () => {
	const originalInnerWidth = window.innerWidth;
	const originalMatchMedia = window.matchMedia;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		window.innerWidth = originalInnerWidth;
		window.matchMedia = originalMatchMedia;
	});

	test("должен возвращать false для больших экранов", () => {
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1024,
		});

		const mockMatchMedia = vi.fn((query: string) => ({
			matches: query === "(max-width: 767px)" ? false : false,
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		})) as unknown as typeof window.matchMedia;

		window.matchMedia = mockMatchMedia;

		const { result } = renderHook(() => useIsMobile());

		expect(result.current).toBe(false);
	});

	test("должен возвращать true для маленьких экранов", () => {
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 500,
		});

		const mockMatchMedia = vi.fn((query: string) => ({
			matches: query === "(max-width: 767px)" ? true : false,
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		})) as unknown as typeof window.matchMedia;

		window.matchMedia = mockMatchMedia;

		const { result } = renderHook(() => useIsMobile());

		expect(result.current).toBe(true);
	});

	test("должен подписываться на изменения размера окна", () => {
		const addEventListener = vi.fn();
		const removeEventListener = vi.fn();

		const mockMatchMedia = vi.fn((query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener,
			removeEventListener,
			dispatchEvent: vi.fn(),
		})) as unknown as typeof window.matchMedia;

		window.matchMedia = mockMatchMedia;

		const { unmount } = renderHook(() => useIsMobile());

		expect(addEventListener).toHaveBeenCalledWith("change", expect.any(Function));

		unmount();

		expect(removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
	});

	test("должен обновляться при изменении размера окна", () => {
		let changeHandler: ((event: MediaQueryListEvent) => void) | null = null;

		const mockMatchMedia = vi.fn((query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn((event: string, handler: EventListener | EventListenerObject) => {
				if (event === "change" && typeof handler === "function") {
					changeHandler = handler as (event: MediaQueryListEvent) => void;
				}
			}),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		})) as unknown as typeof window.matchMedia;

		window.matchMedia = mockMatchMedia;

		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1024,
		});

		const { result } = renderHook(() => useIsMobile());

		expect(result.current).toBe(false);

		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 500,
		});

		if (changeHandler) {
			act(() => {
				changeHandler!({ matches: true } as MediaQueryListEvent);
			});
		}

		expect(result.current).toBe(true);
	});

	test("должен использовать правильный breakpoint (768px)", () => {
		const mockMatchMedia = vi.fn((query: string) => {
			expect(query).toBe("(max-width: 767px)");
			return {
				matches: false,
				media: query,
				onchange: null,
				addListener: vi.fn(),
				removeListener: vi.fn(),
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				dispatchEvent: vi.fn(),
			};
		}) as unknown as typeof window.matchMedia;

		window.matchMedia = mockMatchMedia;

		renderHook(() => useIsMobile());

		expect(mockMatchMedia).toHaveBeenCalledWith("(max-width: 767px)");
	});
});

