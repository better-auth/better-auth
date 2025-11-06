import { describe, expect, it } from "vitest";
import { InvalidRequest } from "../error";
import { parsePrompt } from "./prompt";

describe("parsePrompt", () => {
	it("empty string", () => {
		expect(parsePrompt("")).toEqual(new Set());
		expect(parsePrompt(" ")).toEqual(new Set());
	});

	it("single prompts", () => {
		expect(parsePrompt("login")).toContain("login");
		expect(parsePrompt("consent")).toContain("consent");
		expect(parsePrompt("select_account")).toContain("select_account");
		expect(parsePrompt("none")).toContain("none");
	});

	it("multiple prompts", () => {
		const result = parsePrompt("login consent select_account");
		expect(result).toContain("login");
		expect(result).toContain("consent");
		expect(result).toContain("select_account");
		expect(result.size).toBe(3);
	});

	it("invalid prompts are ignored", () => {
		const result = parsePrompt("login invalid_prompt consent another_invalid");
		expect(result).toContain("login");
		expect(result).toContain("consent");
		expect(result.size).toBe(2);
	});

	it("none with other prompts throws error", () => {
		expect(() => parsePrompt("none login")).toThrowError(InvalidRequest);
	});
});
