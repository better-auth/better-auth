import { describe, expect, it } from "vitest";
import { getRoleParagraphs } from "./careers-data";

describe("getRoleParagraphs", () => {
	const cases: Array<{
		name: string;
		content?: string;
		expected: string[];
	}> = [
		{
			name: "Role",
			content: [
				"About Better Auth",
				"Intro copy",
				"",
				"Role",
				"Build core systems.",
				"Ship product.",
				"",
				"Why You Should Join",
				"Other section",
			].join("\n"),
			expected: ["Build core systems.", "Ship product."],
		},
		{
			name: "The Role",
			content: [
				"The Role",
				"Design APIs.",
				"",
				"What You'll Work On",
				"Other section",
			].join("\n"),
			expected: ["Design APIs."],
		},
		{
			name: "About the Role with trailing colon",
			content: [
				"About the Role:",
				"Lead architecture decisions.",
				"",
				"Why You Should Join:",
				"Other section",
			].join("\n"),
			expected: ["Lead architecture decisions."],
		},
		{
			name: "does not match prose containing role",
			content: [
				"About Better Auth",
				"This role is a chance to build interesting systems.",
				"Why You Should Join",
				"Other section",
			].join("\n"),
			expected: [],
		},
		{
			name: "undefined input",
			content: undefined,
			expected: [],
		},
		{
			name: "empty string",
			content: "",
			expected: [],
		},
	];

	it.each(cases)("extracts role paragraphs for $name", ({
		content,
		expected,
	}) => {
		expect(getRoleParagraphs(content)).toEqual(expected);
	});
});
