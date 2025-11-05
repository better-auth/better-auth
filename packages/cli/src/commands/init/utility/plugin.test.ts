import { describe, expect, it } from "vitest";
import * as z from "zod/v4";
import { type PluginConfig, pluginsConfig } from "../configs/plugins.config";
import type { GetArgumentsFn } from "../generate-auth";
import { formatCode } from "./format";
import { getAuthPluginsCode } from "./plugin";

const formatPluginCode = async (code: string) => {
	return (await formatCode(`[${code}]`)).trim().slice(0, -1);
};

describe("Init CLI - plugin utility", () => {
	describe("empty or undefined plugins", () => {
		it("should return undefined when plugins is undefined", async () => {
			const getArguments: GetArgumentsFn = async ({ flag }) => {};
			const result = await getAuthPluginsCode({
				plugins: undefined,
				getArguments,
			});
			expect(result).toBeUndefined();
		});

		it("should return undefined when plugins is empty array", async () => {
			const getArguments: GetArgumentsFn = async () => undefined;
			const result = await getAuthPluginsCode({
				plugins: [],
				getArguments,
			});
			expect(result).toBeUndefined();
		});
	});

	describe("plugins without arguments", () => {
		it("should generate code for plugin without arguments", async () => {
			const getArguments: GetArgumentsFn = async () => undefined;
			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
				},
				authClient: null,
			};

			const result = await getAuthPluginsCode({
				plugins: [plugin],
				getArguments,
			});

			const expected = await formatPluginCode("testPlugin()");

			expect(result).toBe(expected);
		});

		it("should generate code for multiple plugins without arguments", async () => {
			const getArguments: GetArgumentsFn = async () => undefined;
			const plugins: PluginConfig[] = [
				{
					displayName: "Plugin 1",
					auth: {
						function: "plugin1",
						imports: [],
					},
					authClient: null,
				},
				{
					displayName: "Plugin 2",
					auth: {
						function: "plugin2",
						imports: [],
					},
					authClient: null,
				},
			];

			const result = await getAuthPluginsCode({
				plugins,
				getArguments,
			});

			const expected = await formatPluginCode("plugin1(), plugin2()");

			expect(result).toBe(expected);
		});
	});

	describe("plugins with single non-property arguments", () => {
		it("should generate code for plugin with single string argument", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "test-arg") return "test-value";
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "test-arg",
							question: "Test question",
							argument: {
								index: 0,
								isProperty: false,
								schema: z.string(),
							},
						},
					],
				},
				authClient: null,
			};

			const result = await getAuthPluginsCode({
				plugins: [plugin],
				getArguments,
			});

			const expected = await formatPluginCode('testPlugin("test-value")');

			expect(result).toBe(expected);
		});

		it("should generate code for plugin with single number argument", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "test-arg") return 42;
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "test-arg",
							question: "Test question",
							argument: {
								index: 0,
								isProperty: false,
								schema: z.number(),
							},
						},
					],
				},
				authClient: null,
			};

			const result = await getAuthPluginsCode({
				plugins: [plugin],
				getArguments,
			});

			const expected = await formatPluginCode("testPlugin(42)");

			expect(result).toBe(expected);
		});

		it("should generate code for plugin with single boolean argument", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "test-arg") return true;
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "test-arg",
							question: "Test question",
							argument: {
								index: 0,
								isProperty: false,
								schema: z.boolean(),
							},
						},
					],
				},
				authClient: null,
			};

			const result = await getAuthPluginsCode({
				plugins: [plugin],
				getArguments,
			});

			const expected = await formatPluginCode("testPlugin(true)");

			expect(result).toBe(expected);
		});
	});

	describe("plugins with single property arguments", () => {
		it("should generate code for plugin with single property argument", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "test-arg") return "test-value";
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "test-arg",
							question: "Test question",
							argument: {
								index: 0,
								isProperty: "testProperty",
								schema: z.string(),
							},
						},
					],
				},
				authClient: null,
			};

			const result = await getAuthPluginsCode({
				plugins: [plugin],
				getArguments,
			});

			const expected = await formatPluginCode(
				'testPlugin({"testProperty":"test-value"})',
			);

			expect(result).toBe(expected);
		});
	});

	describe("plugins with multiple property arguments merging", () => {
		it("should merge multiple properties into single object", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "prop1") return "value1";
				if (options.flag === "prop2") return "value2";
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "prop1",
							question: "Property 1",
							argument: {
								index: 0,
								isProperty: "prop1",
								schema: z.string(),
							},
						},
						{
							flag: "prop2",
							question: "Property 2",
							argument: {
								index: 0,
								isProperty: "prop2",
								schema: z.string(),
							},
						},
					],
				},
				authClient: null,
			};

			const result = await getAuthPluginsCode({
				plugins: [plugin],
				getArguments,
			});

			const expected = await formatPluginCode(
				'testPlugin({"prop1":"value1","prop2":"value2"})',
			);

			expect(result).toBe(expected);
		});

		it("should handle property merging with different types", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "name") return "test";
				if (options.flag === "age") return 25;
				if (options.flag === "enabled") return true;
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "name",
							question: "Name",
							argument: {
								index: 0,
								isProperty: "name",
								schema: z.string(),
							},
						},
						{
							flag: "age",
							question: "Age",
							argument: {
								index: 0,
								isProperty: "age",
								schema: z.number(),
							},
						},
						{
							flag: "enabled",
							question: "Enabled",
							argument: {
								index: 0,
								isProperty: "enabled",
								schema: z.boolean(),
							},
						},
					],
				},
				authClient: null,
			};

			const result = await getAuthPluginsCode({
				plugins: [plugin],
				getArguments,
			});

			const expected = await formatPluginCode(
				'testPlugin({"name":"test","age":25,"enabled":true})',
			);

			expect(result).toBe(expected);
		});
	});

	describe("plugins with mixed arguments (properties and non-properties)", () => {
		it("should handle object property followed by non-property argument", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "prop1") return "value1";
				if (options.flag === "non-prop") return "value2";
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "prop1",
							question: "Property 1",
							argument: {
								index: 0,
								isProperty: "prop1",
								schema: z.string(),
							},
						},
						{
							flag: "non-prop",
							question: "Non-property",
							argument: {
								index: 1,
								isProperty: false,
								schema: z.string(),
							},
						},
					],
				},
				authClient: null,
			};

			const result = await getAuthPluginsCode({
				plugins: [plugin],
				getArguments,
			});

			const expected = await formatPluginCode(
				'testPlugin({"prop1":"value1"}, "value2")',
			);

			expect(result).toBe(expected);
		});

		it("should handle non-property argument followed by object property", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "non-prop") return "value1";
				if (options.flag === "prop1") return "value2";
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "non-prop",
							question: "Non-property",
							argument: {
								index: 0,
								isProperty: false,
								schema: z.string(),
							},
						},
						{
							flag: "prop1",
							question: "Property 1",
							argument: {
								index: 1,
								isProperty: "prop1",
								schema: z.string(),
							},
						},
					],
				},
				authClient: null,
			};

			const result = await getAuthPluginsCode({
				plugins: [plugin],
				getArguments,
			});

			const expected = await formatPluginCode(
				'testPlugin("value1", {"prop1":"value2"})',
			);

			expect(result).toBe(expected);
		});

		it("should handle multiple arguments with gaps in indices", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "arg0") return "value0";
				if (options.flag === "arg2") return "value2";
				if (options.flag === "arg4") return "value4";
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "arg0",
							question: "Argument 0",
							argument: {
								index: 0,
								isProperty: false,
								schema: z.string(),
							},
						},
						{
							flag: "arg2",
							question: "Argument 2",
							argument: {
								index: 2,
								isProperty: false,
								schema: z.string(),
							},
						},
						{
							flag: "arg4",
							question: "Argument 4",
							argument: {
								index: 4,
								isProperty: false,
								schema: z.string(),
							},
						},
					],
				},
				authClient: null,
			};

			const result = await getAuthPluginsCode({
				plugins: [plugin],
				getArguments,
			});

			const expected = await formatPluginCode(
				'testPlugin("value0", "value2", "value4")',
			);

			expect(result).toBe(expected);
		});
	});

	describe("undefined value filtering", () => {
		it("should remove trailing undefined values", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "arg0") return "value0";
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "arg0",
							question: "Argument 0",
							argument: {
								index: 0,
								isProperty: false,
								schema: z.string().optional(),
							},
						},
						{
							flag: "arg1",
							question: "Argument 1",
							argument: {
								index: 1,
								isProperty: false,
								schema: z.string().optional(),
							},
						},
						{
							flag: "arg2",
							question: "Argument 2",
							argument: {
								index: 2,
								isProperty: false,
								schema: z.string().optional(),
							},
						},
					],
				},
				authClient: null,
			};

			const result = await getAuthPluginsCode({
				plugins: [plugin],
				getArguments,
			});

			const expected = await formatPluginCode('testPlugin("value0")');

			expect(result).toBe(expected);
		});

		it("should remove trailing undefined values in property objects", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "prop1") return "value1";
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "prop1",
							question: "Property 1",
							argument: {
								index: 0,
								isProperty: "prop1",
								schema: z.string().optional(),
							},
						},
						{
							flag: "prop2",
							question: "Property 2",
							argument: {
								index: 0,
								isProperty: "prop2",
								schema: z.string().optional(),
							},
						},
						{
							flag: "prop3",
							question: "Property 3",
							argument: {
								index: 0,
								isProperty: "prop3",
								schema: z.string().optional(),
							},
						},
					],
				},
				authClient: null,
			};

			const result = await getAuthPluginsCode({
				plugins: [plugin],
				getArguments,
			});

			const expected = await formatPluginCode('testPlugin({"prop1":"value1"})');

			expect(result).toBe(expected);
		});

		it("should handle empty object when all properties are undefined", async () => {
			const getArguments: GetArgumentsFn = async () => undefined;

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "prop1",
							question: "Property 1",
							argument: {
								index: 0,
								isProperty: "prop1",
								schema: z.string().optional(),
							},
						},
						{
							flag: "prop2",
							question: "Property 2",
							argument: {
								index: 0,
								isProperty: "prop2",
								schema: z.string().optional(),
							},
						},
					],
				},
				authClient: null,
			};

			const result = await getAuthPluginsCode({
				plugins: [plugin],
				getArguments,
			});

			const expected = await formatPluginCode("testPlugin()");

			expect(result).toBe(expected);
		});

		it("should not remove undefined values in the middle", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "arg0") return "value0";
				if (options.flag === "arg2") return "value2";
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "arg0",
							question: "Argument 0",
							argument: {
								index: 0,
								isProperty: false,
								schema: z.string().optional(),
							},
						},
						{
							flag: "arg1",
							question: "Argument 1",
							argument: {
								index: 1,
								isProperty: false,
								schema: z.string().optional(),
							},
						},
						{
							flag: "arg2",
							question: "Argument 2",
							argument: {
								index: 2,
								isProperty: false,
								schema: z.string().optional(),
							},
						},
					],
				},
				authClient: null,
			};

			const result = await getAuthPluginsCode({
				plugins: [plugin],
				getArguments,
			});

			const expected = await formatPluginCode(
				'testPlugin("value0", undefined, "value2")',
			);
			expect(result).toBe(expected);
		});
	});

	describe("schema validation", () => {
		it("should throw error for invalid schema validation", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "test-arg") return "invalid";
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "test-arg",
							question: "Test question",
							argument: {
								index: 0,
								isProperty: false,
								schema: z.number(),
							},
						},
					],
				},
				authClient: null,
			};

			await expect(
				getAuthPluginsCode({
					plugins: [plugin],
					getArguments,
				}),
			).rejects.toThrow();
		});

		it("should throw error with descriptive message for invalid schema", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "test-arg") return "not-a-number";
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "test-arg",
							question: "Test question",
							argument: {
								index: 0,
								isProperty: false,
								schema: z.number(),
							},
						},
					],
				},
				authClient: null,
			};

			await expect(
				getAuthPluginsCode({
					plugins: [plugin],
					getArguments,
				}),
			).rejects.toThrow(/Invalid argument for testPlugin/);
		});
	});

	describe("multiple plugins", () => {
		it("should generate code for multiple plugins with arguments", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "plugin1-arg") return "value1";
				if (options.flag === "plugin2-arg") return "value2";
				return undefined;
			};

			const plugins: PluginConfig[] = [
				{
					displayName: "Plugin 1",
					auth: {
						function: "plugin1",
						imports: [],
						arguments: [
							{
								flag: "plugin1-arg",
								question: "Plugin 1 arg",
								argument: {
									index: 0,
									isProperty: false,
									schema: z.string(),
								},
							},
						],
					},
					authClient: null,
				},
				{
					displayName: "Plugin 2",
					auth: {
						function: "plugin2",
						imports: [],
						arguments: [
							{
								flag: "plugin2-arg",
								question: "Plugin 2 arg",
								argument: {
									index: 0,
									isProperty: false,
									schema: z.string(),
								},
							},
						],
					},
					authClient: null,
				},
			];

			const result = await getAuthPluginsCode({
				plugins,
				getArguments,
			});

			const expected = await formatPluginCode(
				'plugin1("value1"), plugin2("value2")',
			);

			expect(result).toBe(expected);
		});

		it("should handle mix of plugins with and without arguments", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "plugin1-arg") return "value1";
				return undefined;
			};

			const plugins: PluginConfig[] = [
				{
					displayName: "Plugin 1",
					auth: {
						function: "plugin1",
						imports: [],
						arguments: [
							{
								flag: "plugin1-arg",
								question: "Plugin 1 arg",
								argument: {
									index: 0,
									isProperty: false,
									schema: z.string(),
								},
							},
						],
					},
					authClient: null,
				},
				{
					displayName: "Plugin 2",
					auth: {
						function: "plugin2",
						imports: [],
					},
					authClient: null,
				},
			];

			const result = await getAuthPluginsCode({
				plugins,
				getArguments,
			});

			const expected = await formatPluginCode('plugin1("value1"), plugin2()');

			expect(result).toBe(expected);
		});
	});

	describe("real-world plugin examples", () => {
		it("should generate code for username plugin with properties", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "max-username-length") return 50;
				if (options.flag === "min-username-length") return 3;
				if (options.flag === "testing") return "test-value";
				return undefined;
			};

			const result = await getAuthPluginsCode({
				plugins: [pluginsConfig.username],
				getArguments,
			});

			expect(result).toContain("username(");
			expect(result).toContain("maxUsernameLength");
			expect(result).toContain("minUsernameLength");
			expect(result).toContain("test-value");
		});

		it("should generate code for twoFactor plugin without arguments", async () => {
			const getArguments: GetArgumentsFn = async () => undefined;

			const result = await getAuthPluginsCode({
				plugins: [pluginsConfig.twoFactor],
				getArguments,
			});
			const expected = await formatPluginCode("twoFactor()");
			expect(result).toBe(expected);
		});

		it("should generate code for multiple real plugins", async () => {
			const getArguments: GetArgumentsFn = async () => undefined;

			const result = await getAuthPluginsCode({
				plugins: [
					pluginsConfig.twoFactor,
					pluginsConfig.magicLink,
					pluginsConfig.emailOTP,
				],
				getArguments,
			});

			const expected = await formatPluginCode(
				"twoFactor(), magicLink(), emailOTP()",
			);
			expect(result).toBe(expected);
		});
	});

	describe("complex argument scenarios", () => {
		it("should handle nested object-like property merging", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "config1") return "value1";
				if (options.flag === "config2") return "value2";
				if (options.flag === "other") return "other-value";
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "config1",
							question: "Config 1",
							argument: {
								index: 0,
								isProperty: "config1",
								schema: z.string(),
							},
						},
						{
							flag: "config2",
							question: "Config 2",
							argument: {
								index: 0,
								isProperty: "config2",
								schema: z.string(),
							},
						},
						{
							flag: "other",
							question: "Other",
							argument: {
								index: 1,
								isProperty: false,
								schema: z.string(),
							},
						},
					],
				},
				authClient: null,
			};

			const result = await getAuthPluginsCode({
				plugins: [plugin],
				getArguments,
			});

			const expected = await formatPluginCode(
				'testPlugin({"config1":"value1","config2":"value2"}, "other-value")',
			);
			expect(result).toBe(expected);
		});

		it("should handle arguments with coerce transformations", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "number-arg") return "42"; // string that should be coerced
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "number-arg",
							question: "Number arg",
							argument: {
								index: 0,
								isProperty: false,
								schema: z.coerce.number(),
							},
						},
					],
				},
				authClient: null,
			};

			const result = await getAuthPluginsCode({
				plugins: [plugin],
				getArguments,
			});

			const expected = await formatPluginCode("testPlugin(42)");
			expect(result).toBe(expected);
		});

		it("should handle optional arguments that are provided", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "optional-arg") return "provided-value";
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "optional-arg",
							question: "Optional arg",
							argument: {
								index: 0,
								isProperty: false,
								schema: z.string().optional(),
							},
						},
					],
				},
				authClient: null,
			};

			const result = await getAuthPluginsCode({
				plugins: [plugin],
				getArguments,
			});

			const expected = await formatPluginCode('testPlugin("provided-value")');
			expect(result).toBe(expected);
		});
	});

	describe("edge cases", () => {
		it("should handle very large argument values", async () => {
			const largeValue = "a".repeat(1000);
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "large-arg") return largeValue;
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "large-arg",
							question: "Large arg",
							argument: {
								index: 0,
								isProperty: false,
								schema: z.string(),
							},
						},
					],
				},
				authClient: null,
			};

			const result = await getAuthPluginsCode({
				plugins: [plugin],
				getArguments,
			});

			const expected = await formatPluginCode(`testPlugin("${largeValue}")`);

			expect(result).toBe(expected);
		});

		it("should handle null values", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "null-arg") return null;
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "null-arg",
							question: "Null arg",
							argument: {
								index: 0,
								isProperty: false,
								schema: z.null(),
							},
						},
					],
				},
				authClient: null,
			};

			const result = await getAuthPluginsCode({
				plugins: [plugin],
				getArguments,
			});

			const expected = await formatPluginCode("testPlugin(null)");
			expect(result).toBe(expected);
		});
	});
});
