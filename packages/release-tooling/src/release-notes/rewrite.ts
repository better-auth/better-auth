import { readFileSync, writeFileSync } from "node:fs";
import type { StructuredGenerator } from "../ai/generate-structured.ts";
import { generateStructured } from "../ai/generate-structured.ts";
import { models } from "../ai/models.ts";
import { validateGeneratedReleaseRewrite } from "./render.ts";
import type {
	GeneratedReleaseReviews,
	GeneratedReleaseRewrites,
	ReleaseRewriteContext,
	ReleaseRewriteFallback,
} from "./schema.ts";
import {
	parseSchema,
	releaseReviewsSchema,
	releaseRewriteContextSchema,
	releaseRewriteKeySchema,
	releaseRewritesSchema,
} from "./schema.ts";

const maxBatchEntries = 30;
const maxBatchCharacters = 60_000;
const maxContextCharacters = 500_000;
const maxOutputTokensPerBatch = 32_000;
const maxReviewOutputTokensPerBatch = 8_000;

const rewriteInstructions = readFileSync(
	new URL("./rewrite.prompt.md", import.meta.url),
	"utf-8",
);
const reviewInstructions = readFileSync(
	new URL("./review.prompt.md", import.meta.url),
	"utf-8",
);
const repairInstructions = readFileSync(
	new URL("./repair.prompt.md", import.meta.url),
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

function orderBatchResults<T extends { id: string }>(
	batch: ReleaseRewriteContext,
	generated: T[],
	label: string,
): T[] {
	const expectedIds = Object.keys(batch).sort();
	const actualIds = generated.map((result) => result.id).sort();
	if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) {
		throw new Error(
			`${label} IDs did not match: expected ${expectedIds.join(", ")}, received ${actualIds.join(", ")}`,
		);
	}
	const generatedById = new Map(generated.map((result) => [result.id, result]));
	return Object.keys(batch).map((id) => {
		const result = generatedById.get(id);
		if (!result) throw new Error(`${label} ${id} is missing`);
		return result;
	});
}

function selectContext(
	context: ReleaseRewriteContext,
	ids: string[],
): ReleaseRewriteContext {
	return Object.fromEntries(
		ids.map((id) => {
			const entry = context[id];
			if (!entry) throw new Error(`Release rewrite context ${id} is missing`);
			return [id, entry];
		}),
	);
}

async function reviewBatch(
	batch: ReleaseRewriteContext,
	rewrites: GeneratedReleaseRewrites,
	name: string,
	generate: StructuredGenerator,
): Promise<GeneratedReleaseReviews> {
	const generated = await generate({
		model: models.releaseNotesReviewer,
		name,
		description: "Factual and actionable release-note review",
		instructions: reviewInstructions,
		prompt: JSON.stringify({ context: batch, rewrites }, null, 2),
		schema: releaseReviewsSchema,
		maxOutputTokens: maxReviewOutputTokensPerBatch,
	});
	return orderBatchResults(batch, generated.reviews, "AI review batch");
}

function validationFeedback(
	context: ReleaseRewriteContext,
	rewrite: GeneratedReleaseRewrites[number],
): string | null {
	const entry = context[rewrite.id];
	if (!entry)
		throw new Error(`Release rewrite context ${rewrite.id} is missing`);
	try {
		validateGeneratedReleaseRewrite(rewrite, entry.changeType === "breaking");
		return null;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}

export async function rewriteReleaseNotes(
	contextPath: string,
	outputPath: string,
	generate: StructuredGenerator = generateStructured,
): Promise<ReleaseRewriteFallback[]> {
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
	const acceptedRewrites = new Map<string, GeneratedReleaseRewrites[number]>();
	for (const batch of buildBatches(context)) {
		const generated = await generate({
			model: models.releaseNotes,
			name: "release_note_rewrites",
			description:
				"User-focused release-note titles and migration instructions",
			instructions: rewriteInstructions,
			prompt: JSON.stringify(batch, null, 2),
			schema: releaseRewritesSchema,
			maxOutputTokens: maxOutputTokensPerBatch,
		});
		const initialRewrites = orderBatchResults(
			batch,
			generated.rewrites,
			"AI rewrite batch",
		);
		const reviews = await reviewBatch(
			batch,
			initialRewrites,
			"release_note_reviews",
			generate,
		);
		const rewritesById = new Map(
			initialRewrites.map((rewrite) => [rewrite.id, rewrite]),
		);
		const feedbackById = new Map<string, string>();

		for (const review of reviews) {
			const rewrite = rewritesById.get(review.id);
			if (!rewrite) throw new Error(`AI rewrite ${review.id} is missing`);
			const copyFeedback = validationFeedback(batch, rewrite);
			if (review.approved && !review.feedback && !copyFeedback) {
				acceptedRewrites.set(review.id, rewrite);
			} else {
				const feedback = review.feedback ?? copyFeedback;
				if (feedback) feedbackById.set(review.id, feedback);
			}
		}

		const repairIds = [...feedbackById.keys()];
		if (repairIds.length === 0) continue;

		const repairContext = selectContext(batch, repairIds);
		const rejectedRewrites = repairIds.map((id) => {
			const rewrite = rewritesById.get(id);
			if (!rewrite) throw new Error(`AI rewrite ${id} is missing`);
			return rewrite;
		});
		try {
			const repaired = await generate({
				model: models.releaseNotes,
				name: "release_note_repairs",
				description: "Release-note rewrites corrected from reviewer feedback",
				instructions: repairInstructions,
				prompt: JSON.stringify(
					{
						context: repairContext,
						rewrites: rejectedRewrites,
						feedback: Object.fromEntries(feedbackById),
					},
					null,
					2,
				),
				schema: releaseRewritesSchema,
				maxOutputTokens: maxOutputTokensPerBatch,
			});
			const repairedRewrites = orderBatchResults(
				repairContext,
				repaired.rewrites,
				"AI repair batch",
			);
			const repairReviews = await reviewBatch(
				repairContext,
				repairedRewrites,
				"release_note_repair_reviews",
				generate,
			);
			const repairedById = new Map(
				repairedRewrites.map((rewrite) => [rewrite.id, rewrite]),
			);
			for (const review of repairReviews) {
				if (!review.approved) continue;
				const rewrite = repairedById.get(review.id);
				if (!rewrite) throw new Error(`AI repair ${review.id} is missing`);
				if (!validationFeedback(repairContext, rewrite)) {
					acceptedRewrites.set(review.id, rewrite);
				}
			}
		} catch (error) {
			console.warn(
				`AI release-note repair failed; using deterministic copy for ${repairIds.join(", ")}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	const rewrites = Object.keys(context).flatMap((id) => {
		const rewrite = acceptedRewrites.get(id);
		return rewrite ? [rewrite] : [];
	});
	const fallbacks = Object.entries(context).flatMap(([id, entry]) =>
		acceptedRewrites.has(id)
			? []
			: [{ title: entry.title, prNumber: entry.prNumber }],
	);
	if (fallbacks.length > 0) {
		console.warn(
			`Using deterministic copy for ${fallbacks.length} release-note ${fallbacks.length === 1 ? "entry" : "entries"}`,
		);
	}
	writeFileSync(outputPath, JSON.stringify({ rewrites }, null, 2));
	console.log(`Wrote AI release-note rewrites to ${outputPath}`);
	return fallbacks;
}
