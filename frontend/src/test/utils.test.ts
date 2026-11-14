import { describe, expect, test } from "vitest";
import { cn } from "../lib/utils";

describe("cn (utils)", () => {
	test("должна объединять классы", () => {
		const result = cn("class1", "class2");
		expect(result).toContain("class1");
		expect(result).toContain("class2");
	});

	test("должна обрабатывать условные классы", () => {
		const result = cn("class1", true && "class2", false && "class3");
		expect(result).toContain("class1");
		expect(result).toContain("class2");
		expect(result).not.toContain("class3");
	});
	test("должна объединять Tailwind классы правильно", () => {
		const result = cn("px-2", "px-4");
		expect(result).not.toContain("px-2");
		expect(result).toContain("px-4");
	});

	test("должна обрабатывать пустые строки", () => {
		const result = cn("", "class1", "");
		expect(result).toContain("class1");
	});

	test("должна обрабатывать undefined и null", () => {
		const result = cn("class1", undefined, null, "class2");
		expect(result).toContain("class1");
		expect(result).toContain("class2");
	});

	test("должна обрабатывать объекты с условиями", () => {
		const result = cn({
			class1: true,
			class2: false,
			class3: true,
		});
		expect(result).toContain("class1");
		expect(result).not.toContain("class2");
		expect(result).toContain("class3");
	});

	test("должна обрабатывать массивы", () => {
		const result = cn(["class1", "class2"], "class3");
		expect(result).toContain("class1");
		expect(result).toContain("class2");
		expect(result).toContain("class3");
	});

	test("должна возвращать пустую строку для пустого входа", () => {
		const result = cn();
		expect(result).toBe("");
	});
});



