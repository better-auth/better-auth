import { readFileSync, writeFileSync } from "node:fs";
import type { StructuredGenerator } from "../ai/generate-structured.ts";
import { generateStructured } from "../ai/generate-structured.ts";
import { models } from "../ai/models.ts";
import type {
	GeneratedReleaseRewrites,
	ReleaseRewriteContext,
} from "./schema.ts";
import {
	parseSchema,
	releaseRewriteContextSchema,
	releaseRewriteKeySchema,
	releaseRewritesSchema,
} from "./schema.ts";

const maxBatchEntries = 30;
const maxBatchCharacters = 60_000;
const maxContextCharacters = 500_000;
const maxOutputTokensPerBatch = 32_000;

const instructions = readFileSync(
	new URL("./rewrite.prompt.md", import.meta.url),
	"utf-8",
);

function buildBatches(context: ReleaseRewriteContext): ReleaseRewriteContext[] {
	const contextCharacters = JSON.stringify(context).length;
	if (contextCharacters > maxContextCharacters) {
		throw new Error(
			`Release rewrite context exceeds ${maxContextCharacters} characters`,
		);
	}

	const batches: ReleaseRewriteContext[] = [];
	let batch = new Map<string, ReleaseRewriteContext[string]>();
	let batchCharacters = 2;

	for (const [key, value] of Object.entries(context)) {
		const entryCharacters = JSON.stringify({ [key]: value }).length;
		if (entryCharacters + 2 > maxBatchCharacters) {
			throw new Error(
				`Release rewrite entry ${key} exceeds ${maxBatchCharacters} characters`,
			);
		}

		if (
			batch.size > 0 &&
			(batch.size >= maxBatchEntries ||
				batchCharacters + entryCharacters > maxBatchCharacters)
		) {
			batches.push(Object.fromEntries(batch));
			batch = new Map();
			batchCharacters = 2;
		}

		batch.set(key, value);
		batchCharacters += entryCharacters;
	}

	if (batch.size > 0) batches.push(Object.fromEntries(batch));
	return batches;
}

function mergeBatch(
	rewrites: GeneratedReleaseRewrites,
	batch: ReleaseRewriteContext,
	generated: GeneratedReleaseRewrites,
): void {
	const expectedIds = Object.keys(batch).sort();
	const actualIds = generated.map((rewrite) => rewrite.id).sort();
	if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) {
		throw new Error(
			`AI rewrite batch IDs did not match: expected ${expectedIds.join(", ")}, received ${actualIds.join(", ")}`,
		);
	}
	const generatedById = new Map(
		generated.map((rewrite) => [rewrite.id, rewrite]),
	);
	for (const id of Object.keys(batch)) {
		const rewrite = generatedById.get(id);
		if (!rewrite) throw new Error(`AI rewrite ${id} is missing`);
		rewrites.push(rewrite);
	}
}

export async function rewriteReleaseNotes(
	contextPath: string,
	outputPath: string,
	generate: StructuredGenerator = generateStructured,
): Promise<void> {
	const rawContext = JSON.parse(readFileSync(contextPath, "utf-8"));
	if (rawContext !== null) {
		for (const key of Object.getOwnPropertyNames(rawContext)) {
			parseSchema(
				releaseRewriteKeySchema,
				key,
				`Invalid release rewrite key ${key}`,
			);
		}
	}
	const context = parseSchema(
		releaseRewriteContextSchema,
		rawContext,
		`Invalid release rewrite context ${contextPath}`,
	);
	const rewrites: GeneratedReleaseRewrites = [];
	for (const batch of buildBatches(context)) {
		const generated = await generate({
			model: models.releaseNotes,
			name: "release_note_rewrites",
			description:
				"User-focused release-note titles and migration instructions",
			instructions,
			prompt: JSON.stringify(batch, null, 2),
			schema: releaseRewritesSchema,
			maxOutputTokens: maxOutputTokensPerBatch,
		});
		mergeBatch(rewrites, batch, generated.rewrites);
	}

	writeFileSync(outputPath, JSON.stringify({ rewrites }, null, 2));
	console.log(`Wrote AI release-note rewrites to ${outputPath}`);
}
