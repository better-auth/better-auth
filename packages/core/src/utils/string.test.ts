import { describe, expect, it } from "vitest";
import {
	capitalizeFirstLetter,
	toCamelCase,
	toKebabCase,
	toPascalCase,
	toSnakeCase,
} from "./string";

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
