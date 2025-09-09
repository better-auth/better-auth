import { describe, it, expect } from "vitest";
import { initTransformOutput } from "../transform-output";
import type { BetterAuthOptions, BetterAuthPlugin } from "../../../types";
import { getAuthTables } from "../../../db";
import type { AdapterConfig } from "../types";
import { merge } from "../../../utils/merger";
import { initTransformInput } from "../transform-input";

/**
 * The purpose of this plugin is to introduce all of the different field types that we support
 * in order to test it against the transformInput & transformOutput functions.
 */
const testSchemaPlugin = {
	id: "test",
	schema: {
		test: {
			fields: {
				//@ts-expect-error - Future proofing
				json: { type: "json" },
				//@ts-expect-error - Future proofing
				jsonb: { type: "jsonb" },
				number: { type: "number" },
				string: { type: "string" },
				boolean: { type: "boolean" },
				date: { type: "date" },
				"number[]": { type: "number[]" },
				"string[]": { type: "string[]" },
			},
		},
	},
} satisfies BetterAuthPlugin;

/**
 * A helper function to initialize the transformOutput function with the correct config and schema.
 * By default all of the field types are supported.
 */
const init = (config?: Partial<AdapterConfig>, options?: BetterAuthOptions) => {
	const optionsObject = merge([options ?? {}, { plugins: [testSchemaPlugin] }]);

	const transformOutput = initTransformOutput({
		schema: getAuthTables(optionsObject),
		options: optionsObject,
		config: {
			adapterId: "test",
			supportsJSONB: true,
			supportsArrays: true,
			supportsBooleans: true,
			supportsDates: true,
			supportsJSON: true,
			supportsNumericIds: true,
			supportsNumbers: true,
			disableIdGeneration: false,
			...config,
		},
	});
	const transformInput = initTransformInput({
		schema: getAuthTables(optionsObject),
		options: optionsObject,
		idField: () => {
			return {
				type: "string",
				required: true,
			};
		},
		config: {
			adapterId: "test",
			supportsJSONB: true,
			supportsArrays: true,
			supportsBooleans: true,
			supportsDates: true,
			supportsJSON: true,
			supportsNumericIds: true,
			supportsNumbers: true,
			disableIdGeneration: false,
			...config,
		},
	});

	return {
		transformOutput: (data: Record<string, any>, select?: string[]) =>
			transformOutput(data, "test", select),
		transformInput: (data: Record<string, any>) =>
			transformInput(data, "test", "create", true),
	};
};

const testDate = new Date();
const testDateString = testDate.toISOString();

const tests: {
	config?: Partial<AdapterConfig>;
	input: Partial<
		Record<
			| "number"
			| "string"
			| "jsonb"
			| "json"
			| "boolean"
			| "date"
			| "number[]"
			| "string[]",
			any
		>
	>;
	transformed: Record<string, any>;
}[] = [
	// Number Conversion
	{
		/**
		 * The config to disable anything we don't support.
		 */
		config: {
			supportsNumbers: false,
		},
		/**
		 * The input data that we will use to test the transformInput function.
		 * The output data should look equal to the input.
		 */
		input: {
			number: 1,
			string: "1",
		},
		/**
		 * This should be the expected result of the transformInput function.
		 * (This would in theory then be saved in DB)
		 * Then the transformOuput would be provided with this data and should return the input.
		 */
		transformed: {
			number: "1",
			string: "1",
		},
	},
	// Boolean Conversion
	{
		config: {
			supportsBooleans: false,
		},
		input: {
			boolean: true,
		},
		transformed: {
			boolean: 1,
		},
	},
	{
		config: {
			supportsBooleans: false,
		},
		input: {
			boolean: false,
		},
		transformed: {
			boolean: 0,
		},
	},
	// If bool & num not supported, it would transform to strings
	// We should make sure it convert backs correctly.
	{
		config: {
			supportsBooleans: false,
			supportsNumbers: false,
		},
		input: {
			boolean: true,
			number: 1,
		},
		transformed: {
			boolean: "1",
			number: "1",
		},
	},
	// Date Conversion
	{
		config: {
			supportsDates: false,
		},
		input: {
			date: testDate,
		},
		transformed: {
			date: testDateString,
		},
	},
	// JSON Conversion
	{
		config: {
			supportsJSON: false,
		},
		input: {
			json: {
				a: 1,
				b: "2",
				c: true,
				d: { hello: testDate },
			},
		},
		transformed: {
			json: JSON.stringify({
				a: 1,
				b: "2",
				c: true,
				d: { hello: testDateString },
			}),
		},
	},
	// JSONB Conversion
	{
		config: {
			supportsJSONB: false,
		},
		input: {
			jsonb: {
				a: 1,
				b: "2",
				c: true,
			},
		},
		transformed: {
			jsonb: {
				a: 1,
				b: "2",
				c: true,
			},
		},
	},
	// JSON & JSONB conversion
	{
		config: {
			supportsJSONB: false,
			supportsJSON: false,
		},
		input: {
			jsonb: {
				a: 1,
				b: "2",
				c: true,
			},
		},
		transformed: {
			jsonb: JSON.stringify({
				a: 1,
				b: "2",
				c: true,
			}),
		},
	},
	// Array Conversion
	{
		config: {
			supportsArrays: false,
		},
		input: {
			"number[]": [1, 2, 3],
			"string[]": ["1", "2", "3"],
		},
		transformed: {
			"number[]": JSON.stringify([1, 2, 3]),
			"string[]": JSON.stringify(["1", "2", "3"]),
		},
	},
];

const generateTestName = (test: (typeof tests)[number]) => {
	let configs: string[] = [];
	for (const [key, value] of Object.entries(test.config ?? {})) {
		configs.push(`${key}: ${value}`);
	}
	let testName = `should correctly transform back values with ${configs.join(
		", ",
	)}`;
	return testName;
};

describe("Create-Adapter: transformInput & transformOutput", () => {
	for (const test of tests) {
		it(generateTestName(test), async () => {
			const { transformOutput, transformInput } = init(test.config);
			// Input -> transformed
			const transformed = await transformInput(test.input);
			expect(transformed).toEqual(test.transformed);
			// Transformed -> output
			// Output should be equal to the input.
			const output = await transformOutput(transformed);
			expect(output).toEqual(test.input);
		});
	}
});
