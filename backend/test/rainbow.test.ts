import { describe, expect, test } from "bun:test";
import { rainbowColorInkantation } from "../src/utils/rainbow.ts";

describe("rainbowColorInkantation", () => {
	test("должна возвращать строку с ANSI цветовыми кодами", () => {
		const input = "test";
		const result = rainbowColorInkantation(input);
		
		expect(result).toBeString();
		expect(result).toContain("\x1b[38;2;");
		expect(result.length).toBeGreaterThan(input.length);
	});

	test("должна применять цвета ко всем символам", () => {
		const input = "hello";
		const result = rainbowColorInkantation(input);
		
		const colorCodeMatches = result.match(/\x1b\[38;2;/g);
		expect(colorCodeMatches?.length).toBe(5);
	});

	test("должна циклически применять цвета", () => {
		const shortInput = "ab";
		const longInput = "abcdefghijklmnopqrstuvwxyz";
		
		const shortResult = rainbowColorInkantation(shortInput);
		const longResult = rainbowColorInkantation(longInput);
		
		expect(shortResult).toBeString();
		expect(longResult).toBeString();
		
		// Проверка циклического применения цветов
		const longColorCodes = longResult.match(/\x1b\[38;2;(\d+);(\d+);(\d+)/g);
		expect(longColorCodes?.length).toBe(26);
	});

	test("должна обрабатывать пустую строку", () => {
		const result = rainbowColorInkantation("");
		expect(result).toBe("");
	});

	test("должна применять правильные RGB значения для первых символов", () => {
		const input = "test";
		const result = rainbowColorInkantation(input);
		
		expect(result).toContain("210;15;57"); //первый символ
		expect(result).toContain("254;100;11"); //второй символ
	});
});



