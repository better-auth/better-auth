import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";
import { generateStructured } from "../src/ai/generate-structured.ts";

function createModel(text: string): MockLanguageModelV4 {
	return new MockLanguageModelV4({
		provider: "test",
		modelId: "test/model",
		doGenerate: async () => ({
			content: [{ type: "text", text }],
			finishReason: { unified: "stop", raw: undefined },
			usage: {
				inputTokens: {
					total: 10,
					noCache: 10,
					cacheRead: undefined,
					cacheWrite: undefined,
				},
				outputTokens: {
					total: 5,
					text: 5,
					reasoning: undefined,
				},
			},
			warnings: [],
		}),
	});
}

describe("generateStructured", () => {
	it("uses AI SDK structured output with an injected model", async () => {
		vi.spyOn(console, "log").mockImplementation(() => undefined);
		const model = createModel('{"value":"generated"}');

		const output = await generateStructured({
			model,
			name: "test_output",
			description: "A test output",
			instructions: "Return the requested value.",
			prompt: "Generate a value.",
			schema: z.strictObject({ value: z.string() }),
			maxOutputTokens: 100,
		});

		expect(output).toEqual({ value: "generated" });
		expect(model.doGenerateCalls).toHaveLength(1);
		expect(model.doGenerateCalls[0]?.responseFormat).toMatchObject({
			type: "json",
		});
	});

	it("reports structured-output failures without exposing model text", async () => {
		const generatedText = "untrusted invalid output";
		const generation = generateStructured({
			model: createModel(generatedText),
			name: "test_output",
			description: "A test output",
			instructions: "Return the requested value.",
			prompt: "Generate a value.",
			schema: z.strictObject({ value: z.string() }),
			maxOutputTokens: 100,
		});

		await expect(generation).rejects.toThrow("did not match its schema");
		await expect(generation).rejects.not.toThrow(generatedText);
	});
});
