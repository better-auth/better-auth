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
	value:
		| JSONValue
		| ((request: Parameters<StructuredGenerator>[0]) => JSONValue),
	onRequest?: (request: Parameters<StructuredGenerator>[0]) => void,
): StructuredGenerator {
	return async (request) => {
		onRequest?.(request);
		const validate = asSchema(request.schema).validate;
		if (!validate) throw new Error("Schema does not provide validation");
		const result = await validate(
			typeof value === "function" ? value(request) : value,
		);
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
		const modelsByRequest = new Map<string, string>();
		let prompt = "";
		let maxOutputTokens = 0;

		const fallbacks = await rewriteReleaseNotes(
			releaseFiles.contextPath,
			releaseFiles.outputPath,
			generatorFor(
				(request) =>
					request.name === "release_note_rewrites"
						? {
								rewrites: [
									{
										id: "pr-42",
										title: "Fixed duplicate session refreshes",
										migration: null,
									},
								],
							}
						: {
								reviews: [{ id: "pr-42", approved: true, feedback: null }],
							},
				(request) => {
					modelsByRequest.set(request.name, modelId(request.model));
					if (request.name === "release_note_rewrites") {
						prompt = request.prompt;
						maxOutputTokens = request.maxOutputTokens;
					}
				},
			),
		);

		expect(modelsByRequest.get("release_note_rewrites")).toBe(
			modelId(models.releaseNotes),
		);
		expect(modelsByRequest.get("release_note_reviews")).toBe(
			modelId(models.releaseNotesReviewer),
		);
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
		expect(fallbacks).toEqual([]);
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
			const prompt: unknown = JSON.parse(request.prompt);
			const batch = parseSchema(
				releaseRewriteContextSchema,
				request.name === "release_note_rewrites"
					? prompt
					: (prompt as { context?: unknown }).context,
				"Invalid test batch",
			);
			const value =
				request.name === "release_note_rewrites"
					? {
							rewrites: Object.keys(batch).map((id) => ({
								id,
								title: "Fixed " + id,
								migration: null,
							})),
						}
					: {
							reviews: Object.keys(batch).map((id) => ({
								id,
								approved: true,
								feedback: null,
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

		expect(calls).toBe(4);
		const output = parseSchema(
			releaseRewritesSchema,
			JSON.parse(readFileSync(releaseFiles.outputPath, "utf-8")),
			"Invalid rewrite output",
		);
		expect(output.rewrites).toHaveLength(31);
	});

	test("repairs copy when review feedback contradicts approval", async ({
		releaseFiles,
	}) => {
		writeFileSync(
			releaseFiles.contextPath,
			JSON.stringify({
				"pr-42": {
					title: "fix(client): preserve plugin assignability",
					changesetDescription:
						"Restore assignability when clients use additional plugins.",
					prNumber: 42,
					packageNames: ["better-auth"],
					changeType: "fix",
				},
			}),
		);

		await rewriteReleaseNotes(
			releaseFiles.contextPath,
			releaseFiles.outputPath,
			generatorFor((request) => {
				switch (request.name) {
					case "release_note_rewrites":
						return {
							rewrites: [
								{
									id: "pr-42",
									title: "Fixed clients with plugins being assignable",
									migration: null,
								},
							],
						};
					case "release_note_reviews":
						return {
							reviews: [
								{
									id: "pr-42",
									approved: true,
									feedback:
										"State that assignability was restored for clients using additional plugins.",
								},
							],
						};
					case "release_note_repairs":
						return {
							rewrites: [
								{
									id: "pr-42",
									title:
										"Restored client assignability when using additional plugins",
									migration: null,
								},
							],
						};
					case "release_note_repair_reviews":
						return {
							reviews: [{ id: "pr-42", approved: true, feedback: null }],
						};
				}
				throw new Error(`Unexpected request ${request.name}`);
			}),
		);

		expect(JSON.parse(readFileSync(releaseFiles.outputPath, "utf-8"))).toEqual({
			rewrites: [
				{
					id: "pr-42",
					title: "Restored client assignability when using additional plugins",
					migration: null,
				},
			],
		});
	});

	test("omits copy that remains rejected after one repair", async ({
		releaseFiles,
	}) => {
		writeFileSync(
			releaseFiles.contextPath,
			JSON.stringify({
				"pr-42": {
					title: "fix: preserve redirect validation",
					changesetDescription:
						"Allow standard paths while preserving open-redirect protection.",
					prNumber: 42,
					packageNames: ["better-auth"],
					changeType: "fix",
				},
				"pr-43": {
					title: "fix: prevent duplicate refreshes",
					changesetDescription: "Prevent duplicate session refreshes.",
					prNumber: 43,
					packageNames: ["better-auth"],
					changeType: "fix",
				},
			}),
		);

		const fallbacks = await rewriteReleaseNotes(
			releaseFiles.contextPath,
			releaseFiles.outputPath,
			generatorFor((request) => {
				if (request.name === "release_note_rewrites") {
					return {
						rewrites: [
							{
								id: "pr-42",
								title: "Improved redirect validation",
								migration: null,
							},
							{
								id: "pr-43",
								title: "Prevented duplicate session refreshes",
								migration: null,
							},
						],
					};
				}
				if (request.name === "release_note_repairs") {
					return {
						rewrites: [
							{
								id: "pr-42",
								title: "Updated redirect validation",
								migration: null,
							},
						],
					};
				}
				return request.name === "release_note_reviews"
					? {
							reviews: [
								{
									id: "pr-42",
									approved: false,
									feedback:
										"Preserve both standard path support and open-redirect protection.",
								},
								{ id: "pr-43", approved: true, feedback: null },
							],
						}
					: {
							reviews: [
								{
									id: "pr-42",
									approved: false,
									feedback:
										"Preserve both standard path support and open-redirect protection.",
								},
							],
						};
			}),
		);

		expect(JSON.parse(readFileSync(releaseFiles.outputPath, "utf-8"))).toEqual({
			rewrites: [
				{
					id: "pr-43",
					title: "Prevented duplicate session refreshes",
					migration: null,
				},
			],
		});
		expect(fallbacks).toEqual([
			{
				title: "fix: preserve redirect validation",
				prNumber: 42,
			},
		]);
	});
});
