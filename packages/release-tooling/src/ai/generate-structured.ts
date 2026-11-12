import type { FlexibleSchema, LanguageModel } from "ai";
import {
	generateText,
	NoObjectGeneratedError,
	NoOutputGeneratedError,
	Output,
	TypeValidationError,
} from "ai";

interface StructuredGenerationRequest<T> {
	model: LanguageModel;
	name: string;
	description: string;
	instructions: string;
	prompt: string;
	schema: FlexibleSchema<T>;
	maxOutputTokens: number;
}

export type StructuredGenerator = <T>(
	request: StructuredGenerationRequest<T>,
) => Promise<T>;

const maxReportedIssues = 10;

interface ValidationIssue {
	path?: ReadonlyArray<PropertyKey | { key: PropertyKey }>;
	message: string;
}

function isValidationIssue(value: unknown): value is ValidationIssue {
	return (
		typeof value === "object" &&
		value !== null &&
		"message" in value &&
		typeof value.message === "string"
	);
}

function validationIssues(cause: unknown): ValidationIssue[] {
	if (!TypeValidationError.isInstance(cause)) return [];
	const reported = cause.cause;
	const issues =
		typeof reported === "object" && reported !== null && "issues" in reported
			? reported.issues
			: reported;
	return Array.isArray(issues) ? issues.filter(isValidationIssue) : [];
}

// Report where the output failed without the output itself: error messages
// from the AI SDK embed the generated text, which repeats release content.
function describeValidationFailure(cause: unknown): string {
	const issues = validationIssues(cause);
	if (issues.length === 0) {
		return TypeValidationError.isInstance(cause)
			? "schema validation failed"
			: "output was not valid JSON";
	}
	const described = issues.slice(0, maxReportedIssues).map((issue) => {
		const path = (issue.path ?? [])
			.map((segment) =>
				String(typeof segment === "object" ? segment.key : segment),
			)
			.join(".");
		return `${path || "(root)"}: ${issue.message}`;
	});
	const omitted = issues.length - described.length;
	if (omitted > 0) described.push(`${omitted} more`);
	return described.join("; ");
}

export const generateStructured: StructuredGenerator = async (request) => {
	try {
		const result = await generateText({
			model: request.model,
			instructions: request.instructions,
			prompt: request.prompt,
			output: Output.object({
				schema: request.schema,
				name: request.name,
				description: request.description,
			}),
			temperature: 0,
			maxOutputTokens: request.maxOutputTokens,
			maxRetries: 2,
			timeout: { totalMs: 120_000 },
		});

		const output = result.output;
		console.log(
			`AI generation: ${result.finalStep.response.modelId} (${result.usage.totalTokens ?? "unknown"} tokens)`,
		);
		return output;
	} catch (error) {
		if (NoObjectGeneratedError.isInstance(error)) {
			throw new Error(
				`AI generation ${request.name} did not match its schema (${error.response?.modelId ?? "unknown model"}, ${error.usage?.totalTokens ?? "unknown"} tokens, finish reason: ${error.finishReason ?? "unknown"}): ${describeValidationFailure(error.cause)}`,
				{ cause: error },
			);
		}
		if (NoOutputGeneratedError.isInstance(error)) {
			throw new Error(
				`AI generation ${request.name} returned no structured output`,
				{ cause: error },
			);
		}
		throw error;
	}
};
