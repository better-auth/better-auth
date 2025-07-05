import { describe, it, expect } from "vitest";
import { initTransformInput } from "../transform-input";
import type { BetterAuthOptions, BetterAuthPlugin } from "../../../types";
import { getAuthTables } from "../../../db";
import type { AdapterConfig } from "../types";
import { merge } from "../../../utils/merger";

/**
 * The purpose of this plugin is to introduce all of the different field types that we support
 * in order to test it against the transformInput function.
 */
const testSchemaPlugin = {
	id: "test",
	schema: {
		test: {
			fields: {
				jsonRequired: { type: "json", required: true },
				dateRequired: { type: "date", required: true },
				dateOptional: { type: "date", required: false },
				jsonOptional: { type: "json", required: false },
				jsonbRequired: { type: "jsonb", required: true },
				jsonbOptional: { type: "jsonb", required: false },
				numberRequired: { type: "number", required: true },
				stringRequired: { type: "string", required: true },
				stringOptional: { type: "string", required: false },
				numberOptional: { type: "number", required: false },
				booleanRequired: { type: "boolean", required: true },
				booleanOptional: { type: "boolean", required: false },
				numberArrayRequired: { type: "number[]", required: true },
				stringArrayRequired: { type: "string[]", required: true },
				stringArrayOptional: { type: "string[]", required: false },
				numberArrayOptional: { type: "number[]", required: false },
			},
		},
	},
} satisfies BetterAuthPlugin;

/**
 * A helper function to initialize the transformInput function with the correct config and schema.
 * By default all of the field types are supported.
 */
const init = (
	config?: Partial<AdapterConfig>,
	operation: "create" | "update" = "create",
	options?: BetterAuthOptions,
) => {
	const optionsObject = merge([options ?? {}, { plugins: [testSchemaPlugin] }]);

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

	return (data: Record<string, any>) =>
		transformInput(data, "test", operation, true);
};

/**
 * A helper function to log the differences between the expected and received output.
 * Useful during debugging a failed test case.
 */
const logDifferences = (expected: any, received: any) => {
	const sortedExpected = Object.entries(expected).sort(([a], [b]) =>
		a.localeCompare(b),
	);
	const sortedReceived = Object.entries(received).sort(([a], [b]) =>
		a.localeCompare(b),
	);
	console.log("--------------------------------");
	console.log("Expected:");
	console.log(Object.fromEntries(sortedExpected));
	console.log("--------------------------------");
	console.log("Received:");
	console.log(Object.fromEntries(sortedReceived));
	console.log("--------------------------------");
};

/**
 * The basic input data that we will use to test the transformInput function.
 * It's a mix of all of the different field types that we support.
 * We also add `0` for number as that can trick the transformInput to treat it as a boolean if coded incorrectly.
 * Same goes with the string being a "1". Just for testing purposes to ensure transformInput doesn't get tricked.
 */
const input = {
	id: "123",
	stringRequired: "1",
	stringOptional: null,
	numberRequired: 0,
	numberOptional: null,
	booleanRequired: true,
	booleanOptional: null,
	dateRequired: new Date(),
	dateOptional: null,
	stringArrayRequired: ["string array", "string array 2"],
	stringArrayOptional: null,
	numberArrayRequired: [0, 1, 2],
	numberArrayOptional: null,
	jsonRequired: {
		key: "value",
		"key 2": -0,
		null: null,
	},
	jsonOptional: null,
	jsonbRequired: {
		key: "value",
		"key 2": -0,
		null: null,
	},
	jsonbOptional: null,
};

describe("create adapter's transformInput", () => {
	it("should support all types", async () => {
		const transformInput = init();
		const result = await transformInput(input);
		const expectedOutput = input;

		try {
			expect(result).toEqual(expectedOutput);
		} catch (error) {
			logDifferences(expectedOutput, result);
			throw error;
		}
	});

	it("should transform numbers into string", async () => {
		const transformInput = init({
			supportsNumbers: false,
		});
		const result = await transformInput(input);
		const expectedOutput = {
			...input,
			numberRequired: input.numberRequired.toString(),
		};

		try {
			expect(result).toEqual(expectedOutput);
		} catch (error) {
			logDifferences(expectedOutput, result);
			throw error;
		}
	});

	it("should transform booleans into numbers", async () => {
		const transformInput = init({
			supportsBooleans: false,
		});
		const result = await transformInput(input);
		const expectedOutput = {
			...input,
			booleanRequired: input.booleanRequired ? 1 : 0,
		};

		try {
			expect(result).toEqual(expectedOutput);
		} catch (error) {
			logDifferences(expectedOutput, result);
			throw error;
		}
	});

	it("should transform dates into ISO string", async () => {
		const transformInput = init({
			supportsDates: false,
		});

		const result = await transformInput(input);

		const expectedOutput = {
			...input,
			dateRequired: input.dateRequired.toISOString(),
		};

		try {
			expect(result).toEqual(expectedOutput);
			expect(input.dateRequired).toEqual(new Date(result.dateRequired));
		} catch (error) {
			logDifferences(expectedOutput, result);
			throw error;
		}
	});

	it("should transform arrays into JSON", async () => {
		const transformInput = init({
			supportsArrays: false,
		});

		const result = await transformInput(input);

		const expectedOutput = {
			...input,
			stringArrayRequired: JSON.stringify(input.stringArrayRequired),
			numberArrayRequired: JSON.stringify(input.numberArrayRequired),
		};

		try {
			expect(result).toEqual(expectedOutput);
		} catch (error) {
			logDifferences(expectedOutput, result);
			throw error;
		}
	});

	it("should transform arrays into string if arrays and JSON is not supported", async () => {
		const transformInput = init({
			supportsArrays: false,
			supportsJSON: false,
		});
		const result = await transformInput(input);
		const expectedOutput = {
			...input,
			jsonRequired: JSON.stringify(input.jsonRequired),
			stringArrayRequired: JSON.stringify(input.stringArrayRequired),
			numberArrayRequired: JSON.stringify(input.numberArrayRequired),
		};

		try {
			expect(result).toEqual(expectedOutput);
		} catch (error) {
			logDifferences(expectedOutput, result);
			throw error;
		}
	});

	it("should transform JSONB into JSON if JSONB is not supported", async () => {
		const transformInput = init({
			supportsJSONB: false,
		});
		const result = await transformInput(input);
		const expectedOutput = {
			...input,
		};

		try {
			expect(result).toEqual(expectedOutput);
		} catch (error) {
			logDifferences(expectedOutput, result);
			throw error;
		}
	});

});
