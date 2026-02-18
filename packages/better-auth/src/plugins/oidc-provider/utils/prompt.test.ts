import { describe, expect, it } from "vitest";
import { InvalidRequest } from "../error";
import { parsePrompt } from "./prompt";

describe("parsePrompt", () => {
	it("should parse single prompt value", () => {
		const result = parsePrompt("login");
		expect(result.has("login")).toBe(true);
		expect(result.size).toBe(1);
	});

	it("should parse multiple prompt values", () => {
		const result = parsePrompt("login consent");
		expect(result.has("login")).toBe(true);
		expect(result.has("consent")).toBe(true);
		expect(result.size).toBe(2);
	});

	it("should parse space-separated prompts with extra spaces", () => {
		const result = parsePrompt("login  consent   select_account");
		expect(result.has("login")).toBe(true);
		expect(result.has("consent")).toBe(true);
		expect(result.has("select_account")).toBe(true);
		expect(result.size).toBe(3);
	});

	it("should ignore invalid prompt values", () => {
		const result = parsePrompt("login invalid_prompt consent");
		expect(result.has("login")).toBe(true);
		expect(result.has("consent")).toBe(true);
		expect(result.size).toBe(2);
	});

	it("should handle none prompt alone", () => {
		const result = parsePrompt("none");
		expect(result.has("none")).toBe(true);
		expect(result.size).toBe(1);
	});

	it("should throw error when none is combined with other prompts", () => {
		expect(() => parsePrompt("none login")).toThrow(InvalidRequest);
		try {
			parsePrompt("none login");
			expect.fail("Should have thrown InvalidRequest");
		} catch (error) {
			expect(error).toBeInstanceOf(InvalidRequest);
			expect((error as any).body.error_description).toBe(
				"prompt none must only be used alone",
			);
		}
	});

	it("should throw error when none is combined with consent", () => {
		expect(() => parsePrompt("none consent")).toThrow(InvalidRequest);
	});

	it("should return empty set for empty string", () => {
		const result = parsePrompt("");
		expect(result.size).toBe(0);
	});

	it("should handle all valid prompt types", () => {
		const result = parsePrompt("login consent select_account");
		expect(result.has("login")).toBe(true);
		expect(result.has("consent")).toBe(true);
		expect(result.has("select_account")).toBe(true);
		expect(result.size).toBe(3);
	});
});
