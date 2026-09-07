import { describe, expect, it } from "vitest";
import { parseConventionalHeader } from "../src/conventional-header.ts";

describe("parseConventionalHeader", () => {
	it.each([
		{
			header: "feat(api): add token introspection",
			expected: {
				type: "feat",
				scope: "api",
				subject: "add token introspection",
				breaking: false,
			},
		},
		{
			header: "feat!: remove the legacy endpoint",
			expected: {
				type: "feat",
				scope: "",
				subject: "remove the legacy endpoint",
				breaking: true,
			},
		},
		{
			header: "fix(session)!: require signed cookies",
			expected: {
				type: "fix",
				scope: "session",
				subject: "require signed cookies",
				breaking: true,
			},
		},
	])("parses $header", ({ header, expected }) => {
		expect(parseConventionalHeader(header)).toEqual(expected);
	});

	it("preserves non-conventional headers as their subject", () => {
		expect(parseConventionalHeader("Update release documentation")).toEqual({
			type: "",
			scope: "",
			subject: "Update release documentation",
			breaking: false,
		});
	});
});
