import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { JSONValue, LanguageModel } from "ai";
import { asSchema } from "ai";
import { test as baseTest, describe, expect } from "vitest";
import type { StructuredGenerator } from "../src/ai/generate-structured.ts";
import { models } from "../src/ai/models.ts";
import { rewriteReleaseNotes } from "../src/release-notes/rewrite.ts";
import {
	parseSchema,
	releaseRewriteContextSchema,
	releaseRewritesSchema,
} from "../src/release-notes/schema.ts";

function modelId(model: LanguageModel): string {
	return typeof model === "string" ? model : model.modelId;
}

function generatorFor(
	value: JSONValue,
	onRequest?: (request: Parameters<StructuredGenerator>[0]) => void,
): StructuredGenerator {
	return async (request) => {
		onRequest?.(request);
		const validate = asSchema(request.schema).validate;
		if (!validate) throw new Error("Schema does not provide validation");
		const result = await validate(value);
		if (!result.success) throw result.error;
		return result.value;
	};
}

const test = baseTest.extend("releaseFiles", ({}, { onCleanup }) => {
	const directory = mkdtempSync(resolve(tmpdir(), "release-rewrite-"));
	onCleanup(() => rmSync(directory, { recursive: true }));
	return {
		contextPath: resolve(directory, "context.json"),
		outputPath: resolve(directory, "rewrites.json"),
	};
});

describe("release-note rewriting", () => {
	test("writes typed rewrites without giving the model tools", async ({
		releaseFiles,
	}) => {
		writeFileSync(
			releaseFiles.contextPath,
			JSON.stringify({
				"pr-42": {
					title: "fix(session): prevent duplicate refreshes",
					changesetDescription: "Prevent duplicate session refreshes.",
					prNumber: 42,
					packageNames: ["better-auth"],
					changeType: "fix",
				},
			}),
		);
		let model = "";
		let prompt = "";
		let maxOutputTokens = 0;

		await rewriteReleaseNotes(
			releaseFiles.contextPath,
			releaseFiles.outputPath,
			generatorFor(
				{
					rewrites: [
						{
							id: "pr-42",
							title: "Fixed duplicate session refreshes",
							migration: null,
						},
					],
				},
				(request) => {
					model = modelId(request.model);
					prompt = request.prompt;
					maxOutputTokens = request.maxOutputTokens;
				},
			),
		);

		expect(model).toBe(modelId(models.releaseNotes));
		expect(prompt).toContain('"pr-42"');
		expect(prompt).not.toContain("gh pr diff");
		expect(maxOutputTokens).toBe(32_000);
		const output = parseSchema(
			releaseRewritesSchema,
			JSON.parse(readFileSync(releaseFiles.outputPath, "utf-8")),
			"Invalid rewrite output",
		);
		expect(output).toEqual({
			rewrites: [
				{
					id: "pr-42",
					title: "Fixed duplicate session refreshes",
					migration: null,
				},
			],
		});
	});

	test("rejects invalid context before calling the model", async ({
		releaseFiles,
	}) => {
		writeFileSync(
			releaseFiles.contextPath,
			JSON.stringify({ "pr-42": { title: "Fix" } }),
		);
		let calls = 0;
		const generate: StructuredGenerator = async () => {
			calls += 1;
			throw new Error("Unexpected model call");
		};

		await expect(
			rewriteReleaseNotes(
				releaseFiles.contextPath,
				releaseFiles.outputPath,
				generate,
			),
		).rejects.toThrow("Invalid release rewrite context");
		expect(calls).toBe(0);
	});

	test("rejects prototype-like rewrite IDs", async ({ releaseFiles }) => {
		const context = Object.fromEntries([
			[
				"__proto__",
				{
					title: "fix: preserve safe object keys",
					changesetDescription: "Preserve safe object keys.",
					prNumber: null,
					packageNames: ["better-auth"],
					changeType: "fix",
				},
			],
		]);
		writeFileSync(releaseFiles.contextPath, JSON.stringify(context));

		await expect(
			rewriteReleaseNotes(
				releaseFiles.contextPath,
				releaseFiles.outputPath,
				generatorFor({ rewrites: [] }),
			),
		).rejects.toThrow("must not be a prototype property");
	});

	test("rejects oversized changeset context before calling the model", async ({
		releaseFiles,
	}) => {
		writeFileSync(
			releaseFiles.contextPath,
			JSON.stringify({
				"pr-42": {
					title: "fix: oversized change",
					changesetDescription: "x".repeat(20_001),
					prNumber: 42,
					packageNames: ["better-auth"],
					changeType: "fix",
				},
			}),
		);
		let calls = 0;
		const generate: StructuredGenerator = async () => {
			calls += 1;
			throw new Error("Unexpected model call");
		};

		await expect(
			rewriteReleaseNotes(
				releaseFiles.contextPath,
				releaseFiles.outputPath,
				generate,
			),
		).rejects.toThrow("Invalid release rewrite context");
		expect(calls).toBe(0);
	});

	test("rewrites large releases in bounded batches", async ({
		releaseFiles,
	}) => {
		const context = Object.fromEntries(
			Array.from({ length: 31 }, (_, index) => {
				const number = index + 1;
				return [
					"pr-" + number,
					{
						title: "fix: change " + number,
						changesetDescription: "Fix change " + number + ".",
						prNumber: number,
						packageNames: ["better-auth"],
						changeType: "fix",
					},
				];
			}),
		);
		writeFileSync(releaseFiles.contextPath, JSON.stringify(context));
		let calls = 0;
		const generate: StructuredGenerator = async (request) => {
			calls += 1;
			const batch = parseSchema(
				releaseRewriteContextSchema,
				JSON.parse(request.prompt),
				"Invalid test batch",
			);
			const value = {
				rewrites: Object.keys(batch).map((id) => ({
					id,
					title: "Fixed " + id,
					migration: null,
				})),
			};
			const validate = asSchema(request.schema).validate;
			if (!validate) throw new Error("Schema does not provide validation");
			const result = await validate(value);
			if (!result.success) throw result.error;
			return result.value;
		};

		await rewriteReleaseNotes(
			releaseFiles.contextPath,
			releaseFiles.outputPath,
			generate,
		);

		expect(calls).toBe(2);
		const output = parseSchema(
			releaseRewritesSchema,
			JSON.parse(readFileSync(releaseFiles.outputPath, "utf-8")),
			"Invalid rewrite output",
		);
		expect(output.rewrites).toHaveLength(31);
	});
});
