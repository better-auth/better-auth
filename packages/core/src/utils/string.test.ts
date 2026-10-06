import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import {
	capitalizeFirstLetter,
	toCamelCase,
	toKebabCase,
	toPascalCase,
	toSnakeCase,
} from "./string";

describe("Lynx compatibility", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/11591
	 */
	it("does not use Unicode property escapes in regex literals", () => {
		const source = readFileSync(new URL("./string.ts", import.meta.url), "utf8");
		const sourceFile = ts.createSourceFile(
			"string.ts",
			source,
			ts.ScriptTarget.ESNext,
		);
		const regexLiterals: string[] = [];

		function visit(node: ts.Node) {
			if (ts.isRegularExpressionLiteral(node)) {
				regexLiterals.push(node.text);
			}
			ts.forEachChild(node, visit);
		}

		visit(sourceFile);

		expect(regexLiterals.some((pattern) => pattern.includes("\\p{"))).toBe(
			false,
		);
	});

	it("preserves non-ASCII words when Unicode property escapes are unsupported", async () => {
		const unicodeWordPattern =
			"[\\p{Ll}\\d]+|\\p{Lu}+(?!\\p{Ll})|\\p{Lu}[\\p{Ll}\\d]+|\\p{Lo}+";

		class UnsupportedUnicodePropertyRegExp extends RegExp {
			constructor(pattern?: string | RegExp, flags?: string) {
				if (pattern === unicodeWordPattern) {
					throw new SyntaxError("Unicode property escapes are unsupported");
				}
				super(pattern ?? "", flags);
			}
		}

		vi.stubGlobal("RegExp", UnsupportedUnicodePropertyRegExp);
		try {
			vi.resetModules();
			const { toKebabCase: fallbackToKebabCase, toSnakeCase: fallbackToSnakeCase } =
				await import("./string");

			expect(fallbackToKebabCase("URLPath")).toBe("url-path");
			expect(fallbackToSnakeCase("caféBar")).toBe("café_bar");
			expect(fallbackToSnakeCase("한글Test")).toBe("한글_test");
			expect(fallbackToSnakeCase("Написание")).toBe("написание");
		} finally {
			vi.unstubAllGlobals();
			vi.resetModules();
		}
	});
});

describe("capitalizeFirstLetter", () => {
	it("uppercases the first character only", () => {
		expect(capitalizeFirstLetter("hello")).toBe("Hello");
		expect(capitalizeFirstLetter("HELLO")).toBe("HELLO");
		expect(capitalizeFirstLetter("")).toBe("");
	});
});

describe("toSnakeCase", () => {
	it.each([
		["userId", "user_id"],
		["user_id", "user_id"],
		["UserId", "user_id"],
		["USER_ID", "user_id"],
		["URL", "url"],
		["URLPath", "url_path"],
		["my-kebab-case", "my_kebab_case"],
		["foo123Bar", "foo123_bar"],
		["", ""],
		["it's a test", "its_a_test"],
		["한글Test", "한글_test"],
		["user_한글_id", "user_한글_id"],
		["caféBar", "café_bar"],
	])("%s -> %s", (input, expected) => {
		expect(toSnakeCase(input)).toBe(expected);
	});
});

describe("toKebabCase", () => {
	it.each([
		["userId", "user-id"],
		["user_id", "user-id"],
		["UserId", "user-id"],
		["URLPath", "url-path"],
		["", ""],
	])("%s -> %s", (input, expected) => {
		expect(toKebabCase(input)).toBe(expected);
	});
});

describe("toCamelCase", () => {
	it.each([
		["user_id", "userId"],
		["user-id", "userId"],
		["UserId", "userId"],
		["URL_PATH", "urlPATH"],
		["my-kebab-case", "myKebabCase"],
		["", ""],
	])("%s -> %s", (input, expected) => {
		expect(toCamelCase(input)).toBe(expected);
	});
});

describe("toPascalCase", () => {
	it.each([
		["user_id", "UserId"],
		["user-id", "UserId"],
		["userId", "UserId"],
		["URL_PATH", "UrlPath"],
		["get", "Get"],
		["POST", "Post"],
		["my-kebab-case", "MyKebabCase"],
		["한글test", "한글Test"],
		["", ""],
	])("%s -> %s", (input, expected) => {
		expect(toPascalCase(input)).toBe(expected);
	});
});
