import type { FlexibleSchema, LanguageModel } from "ai";
import {
	generateText,
	NoObjectGeneratedError,
	NoOutputGeneratedError,
	Output,
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
				`AI generation ${request.name} did not match its schema (${error.response?.modelId ?? "unknown model"}, ${error.usage?.totalTokens ?? "unknown"} tokens, finish reason: ${error.finishReason ?? "unknown"})`,
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
