import { describe, expect, it } from "vitest";
import * as z from "zod/v4";
import type { PluginConfig } from "../configs/plugins-index.config";
import { tempPluginsConfig } from "../configs/temp-plugins.config";
import type { GetArgumentsFn } from "../generate-auth";
import { formatCode } from "./format";
import { getAuthClientPluginsCode, getAuthPluginsCode } from "./plugin";

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
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
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
							description: "Test description",
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
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
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
							description: "Test description",
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
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
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
							description: "Test description",
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
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
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
							description: "Test description",
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
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
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
							description: "Property 1 description",
							argument: {
								index: 0,
								isProperty: "prop1",
								schema: z.string(),
							},
						},
						{
							flag: "prop2",
							question: "Property 2",
							description: "Property 2 description",
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
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
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
							description: "Name description",
							argument: {
								index: 0,
								isProperty: "name",
								schema: z.string(),
							},
						},
						{
							flag: "age",
							question: "Age",
							description: "Age description",
							argument: {
								index: 0,
								isProperty: "age",
								schema: z.number(),
							},
						},
						{
							flag: "enabled",
							question: "Enabled",
							description: "Enabled description",
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
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
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
							description: "Property 1 description",
							argument: {
								index: 0,
								isProperty: "prop1",
								schema: z.string(),
							},
						},
						{
							flag: "non-prop",
							question: "Non-property",
							description: "Non-property description",
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
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
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
							description: "Non-property description",
							argument: {
								index: 0,
								isProperty: false,
								schema: z.string(),
							},
						},
						{
							flag: "prop1",
							question: "Property 1",
							description: "Property 1 description",
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
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
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
							description: "Argument 0 description",
							argument: {
								index: 0,
								isProperty: false,
								schema: z.string(),
							},
						},
						{
							flag: "arg2",
							question: "Argument 2",
							description: "Argument 2 description",
							argument: {
								index: 2,
								isProperty: false,
								schema: z.string(),
							},
						},
						{
							flag: "arg4",
							question: "Argument 4",
							description: "Argument 4 description",
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
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
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
							description: "Argument 0 description",
							argument: {
								index: 0,
								isProperty: false,
								schema: z.string().optional(),
							},
						},
						{
							flag: "arg1",
							question: "Argument 1",
							description: "Argument 1 description",
							argument: {
								index: 1,
								isProperty: false,
								schema: z.string().optional(),
							},
						},
						{
							flag: "arg2",
							question: "Argument 2",
							description: "Argument 2 description",
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
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
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
							description: "Property 1 description",
							argument: {
								index: 0,
								isProperty: "prop1",
								schema: z.string().optional(),
							},
						},
						{
							flag: "prop2",
							question: "Property 2",
							description: "Property 2 description",
							argument: {
								index: 0,
								isProperty: "prop2",
								schema: z.string().optional(),
							},
						},
						{
							flag: "prop3",
							question: "Property 3",
							description: "Property 3 description",
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
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
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
							description: "Property 1 description",
							argument: {
								index: 0,
								isProperty: "prop1",
								schema: z.string().optional(),
							},
						},
						{
							flag: "prop2",
							question: "Property 2",
							description: "Property 2 description",
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
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
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
							description: "Argument 0 description",
							argument: {
								index: 0,
								isProperty: false,
								schema: z.string().optional(),
							},
						},
						{
							flag: "arg1",
							question: "Argument 1",
							description: "Argument 1 description",
							argument: {
								index: 1,
								isProperty: false,
								schema: z.string().optional(),
							},
						},
						{
							flag: "arg2",
							question: "Argument 2",
							description: "Argument 2 description",
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
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
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
							description: "Test description",
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
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
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
							description: "Test description",
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
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
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
								description: "Plugin 1 arg description",
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
								description: "Plugin 2 arg description",
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
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
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
								description: "Plugin 1 arg description",
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
				if (options.flag === "username-max-username-length") return 50;
				if (options.flag === "username-min-username-length") return 3;
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
			};

			const result = await getAuthPluginsCode({
				plugins: [tempPluginsConfig.username],
				getArguments,
			});

			expect(result).toContain("username(");
			expect(result).toContain("maxUsernameLength");
			expect(result).toContain("minUsernameLength");
		});

		it("should generate code for twoFactor plugin without arguments", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
			};

			const result = await getAuthPluginsCode({
				plugins: [tempPluginsConfig.twoFactor],
				getArguments,
			});
			const expected = await formatPluginCode("twoFactor()");
			expect(result).toBe(expected);
		});

		it("should generate code for multiple real plugins", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
			};

			const result = await getAuthPluginsCode({
				plugins: [
					tempPluginsConfig.twoFactor,
					tempPluginsConfig.magicLink,
					tempPluginsConfig.emailOTP,
				],
				getArguments,
			});

			const expected = await formatPluginCode(
				"twoFactor(), magicLink({ sendMagicLink: async ({ email, url, token }, request) => {\n // Send magic link to the user\n},}), emailOTP({ sendVerificationOTP: async ({ email, otp, type }, request) => {\n // Send email with OTP\n} })",
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
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
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
							description: "Config 1 description",
							argument: {
								index: 0,
								isProperty: "config1",
								schema: z.string(),
							},
						},
						{
							flag: "config2",
							question: "Config 2",
							description: "Config 2 description",
							argument: {
								index: 0,
								isProperty: "config2",
								schema: z.string(),
							},
						},
						{
							flag: "other",
							question: "Other",
							description: "Other description",
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
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
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
							description: "Number arg description",
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
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
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
							description: "Optional arg description",
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

	describe("nested objects", () => {
		it("should handle nested object with single property", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "digits") return 6;
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "totp",
							description: "TOTP configuration",
							skipPrompt: true,
							isNestedObject: [
								{
									flag: "digits",
									question: "Number of digits",
									description: "Number of digits for TOTP",
									defaultValue: 6,
									skipPrompt: true,
									argument: {
										index: 0,
										isProperty: "digits",
										schema: z.coerce.number().min(6).max(8).optional(),
									},
								},
							],
							argument: {
								index: 0,
								isProperty: "totp",
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
				'testPlugin({"totp":{"digits":6}})',
			);
			expect(result).toBe(expected);
		});

		it("should handle nested object with multiple properties", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "digits") return 6;
				if (options.flag === "issuer") return "MyApp";
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "totp",
							description: "TOTP configuration",
							skipPrompt: true,
							isNestedObject: [
								{
									flag: "digits",
									question: "Number of digits",
									description: "Number of digits for TOTP",
									defaultValue: 6,
									skipPrompt: true,
									argument: {
										index: 0,
										isProperty: "digits",
										schema: z.coerce.number().min(6).max(8).optional(),
									},
								},
								{
									flag: "issuer",
									question: "Issuer name",
									description: "TOTP issuer name",
									skipPrompt: true,
									argument: {
										index: 0,
										isProperty: "issuer",
										schema: z.string().optional(),
									},
								},
							],
							argument: {
								index: 0,
								isProperty: "totp",
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
				'testPlugin({"totp":{"digits":6,"issuer":"MyApp"}})',
			);
			expect(result).toBe(expected);
		});

		it("should handle empty nested object when all properties are undefined", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "totp",
							description: "TOTP configuration",
							skipPrompt: true,
							isNestedObject: [
								{
									flag: "digits",
									question: "Number of digits",
									description: "Number of digits for TOTP",
									defaultValue: 6,
									skipPrompt: true,
									argument: {
										index: 0,
										isProperty: "digits",
										schema: z.coerce.number().min(6).max(8).optional(),
									},
								},
							],
							argument: {
								index: 0,
								isProperty: "totp",
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

		it("should handle nested object with partially undefined properties", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "digits") return 6;
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "totp",
							description: "TOTP configuration",
							skipPrompt: true,
							isNestedObject: [
								{
									flag: "digits",
									question: "Number of digits",
									description: "Number of digits for TOTP",
									defaultValue: 6,
									skipPrompt: true,
									argument: {
										index: 0,
										isProperty: "digits",
										schema: z.coerce.number().min(6).max(8).optional(),
									},
								},
								{
									flag: "issuer",
									question: "Issuer name",
									description: "TOTP issuer name",
									skipPrompt: true,
									argument: {
										index: 0,
										isProperty: "issuer",
										schema: z.string().optional(),
									},
								},
							],
							argument: {
								index: 0,
								isProperty: "totp",
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
				'testPlugin({"totp":{"digits":6}})',
			);
			expect(result).toBe(expected);
		});

		it("should handle deeply nested objects", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "nested-prop") return "nested-value";
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "outer",
							description: "Outer configuration",
							skipPrompt: true,
							isNestedObject: [
								{
									flag: "inner",
									description: "Inner configuration",
									skipPrompt: true,
									isNestedObject: [
										{
											flag: "nested-prop",
											question: "Nested property",
											description: "Nested property description",
											skipPrompt: true,
											argument: {
												index: 0,
												isProperty: "nestedProp",
												schema: z.string().optional(),
											},
										},
									],
									argument: {
										index: 0,
										isProperty: "inner",
									},
								},
							],
							argument: {
								index: 0,
								isProperty: "outer",
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
				'testPlugin({"outer":{"inner":{"nestedProp":"nested-value"}}})',
			);
			expect(result).toBe(expected);
		});

		it("should handle deeply nested empty objects", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "outer",
							description: "Outer configuration",
							skipPrompt: true,
							isNestedObject: [
								{
									flag: "inner",
									description: "Inner configuration",
									skipPrompt: true,
									isNestedObject: [
										{
											flag: "nested-prop",
											question: "Nested property",
											description: "Nested property description",
											skipPrompt: true,
											argument: {
												index: 0,
												isProperty: "nestedProp",
												schema: z.string().optional(),
											},
										},
									],
									argument: {
										index: 0,
										isProperty: "inner",
									},
								},
							],
							argument: {
								index: 0,
								isProperty: "outer",
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

		it("should handle nested object merged with other properties", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "digits") return 6;
				if (options.flag === "other-prop") return "other-value";
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "totp",
							description: "TOTP configuration",
							skipPrompt: true,
							isNestedObject: [
								{
									flag: "digits",
									question: "Number of digits",
									description: "Number of digits for TOTP",
									defaultValue: 6,
									skipPrompt: true,
									argument: {
										index: 0,
										isProperty: "digits",
										schema: z.coerce.number().min(6).max(8).optional(),
									},
								},
							],
							argument: {
								index: 0,
								isProperty: "totp",
							},
						},
						{
							flag: "other-prop",
							question: "Other property",
							description: "Other property description",
							skipPrompt: true,
							argument: {
								index: 0,
								isProperty: "otherProp",
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
				'testPlugin({"totp":{"digits":6},"otherProp":"other-value"})',
			);
			expect(result).toBe(expected);
		});

		it("should handle nested object with schema validation", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "digits") return 6;
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "totp",
							description: "TOTP configuration",
							skipPrompt: true,
							isNestedObject: [
								{
									flag: "digits",
									question: "Number of digits",
									description: "Number of digits for TOTP",
									defaultValue: 6,
									skipPrompt: true,
									argument: {
										index: 0,
										isProperty: "digits",
										schema: z.coerce.number().min(6).max(8).optional(),
									},
								},
							],
							argument: {
								index: 0,
								isProperty: "totp",
								schema: z
									.object({
										digits: z.number().optional(),
									})
									.optional(),
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
				'testPlugin({"totp":{"digits":6}})',
			);
			expect(result).toBe(expected);
		});

		it("should handle nested object where inner object becomes empty", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "outer-prop") return "outer-value";
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "outer",
							description: "Outer configuration",
							skipPrompt: true,
							isNestedObject: [
								{
									flag: "outer-prop",
									question: "Outer property",
									description: "Outer property description",
									skipPrompt: true,
									argument: {
										index: 0,
										isProperty: "outerProp",
										schema: z.string().optional(),
									},
								},
								{
									flag: "inner",
									description: "Inner configuration",
									skipPrompt: true,
									isNestedObject: [
										{
											flag: "nested-prop",
											question: "Nested property",
											description: "Nested property description",
											skipPrompt: true,
											argument: {
												index: 0,
												isProperty: "nestedProp",
												schema: z.string().optional(),
											},
										},
									],
									argument: {
										index: 0,
										isProperty: "inner",
									},
								},
							],
							argument: {
								index: 0,
								isProperty: "outer",
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
				'testPlugin({"outer":{"outerProp":"outer-value"}})',
			);
			expect(result).toBe(expected);
		});

		it("should handle nested object with non-property argument after", async () => {
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "digits") return 6;
				if (options.flag === "other-arg") return "other-value";
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "totp",
							description: "TOTP configuration",
							skipPrompt: true,
							isNestedObject: [
								{
									flag: "digits",
									question: "Number of digits",
									description: "Number of digits for TOTP",
									defaultValue: 6,
									skipPrompt: true,
									argument: {
										index: 0,
										isProperty: "digits",
										schema: z.coerce.number().min(6).max(8).optional(),
									},
								},
							],
							argument: {
								index: 0,
								isProperty: "totp",
							},
						},
						{
							flag: "other-arg",
							question: "Other argument",
							description: "Other argument description",
							skipPrompt: true,
							argument: {
								index: 1,
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
				'testPlugin({"totp":{"digits":6}}, "other-value")',
			);
			expect(result).toBe(expected);
		});
	});

	describe("function string handling", () => {
		it("should output function string as actual function, not string", async () => {
			const functionString = "async (data) => { return data; }";
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "send-email") return functionString;
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "send-email",
							description: "Function to send email",
							skipPrompt: true,
							defaultValue: functionString,
							argument: {
								index: 0,
								isProperty: "sendEmail",
								schema: z.coerce.string(),
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

			// Function should be output directly, not as a template literal string
			const expected = await formatPluginCode(
				`testPlugin({ sendEmail: ${functionString} })`,
			);
			expect(result).toBe(expected);
		});

		it("should handle multi-line function string as actual function", async () => {
			const functionString =
				"async (data) => {\n  console.log(data);\n  return true;\n}";
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "send-email") return functionString;
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "send-email",
							description: "Function to send email",
							skipPrompt: true,
							defaultValue: functionString,
							argument: {
								index: 0,
								isProperty: "sendEmail",
								schema: z.coerce.string(),
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

			// Multi-line function should be output directly as a function
			const expected = await formatPluginCode(
				`testPlugin({ sendEmail: ${functionString} })`,
			);
			expect(result).toBe(expected);
		});

		it("should return defaultValue when skipPrompt is true and output as function", async () => {
			const functionString = "async (data) => { return data; }";
			const getArguments: GetArgumentsFn = async (options) => {
				// When skipPrompt is true, getArguments should return defaultValue
				if (options.flag === "send-email" && options.skipPrompt) {
					return options.defaultValue;
				}
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "send-email",
							description: "Function to send email",
							skipPrompt: true,
							defaultValue: functionString,
							argument: {
								index: 0,
								isProperty: "sendEmail",
								schema: z.coerce.string(),
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

			// Function should be output directly, not as a string
			const expected = await formatPluginCode(
				`testPlugin({ sendEmail: ${functionString} })`,
			);
			expect(result).toBe(expected);
		});

		it("should handle function string in nested object as actual function", async () => {
			const functionString = "async (data) => { return data; }";
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "send-email") return functionString;
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "email-config",
							description: "Email configuration",
							skipPrompt: true,
							isNestedObject: [
								{
									flag: "send-email",
									description: "Function to send email",
									skipPrompt: true,
									defaultValue: functionString,
									argument: {
										index: 0,
										isProperty: "sendEmail",
										schema: z.coerce.string(),
									},
								},
							],
							argument: {
								index: 0,
								isProperty: "emailConfig",
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

			// Function in nested object should be output directly as a function
			const expected = await formatPluginCode(
				`testPlugin({ emailConfig: { sendEmail: ${functionString} } })`,
			);
			expect(result).toBe(expected);
		});

		it("should handle function string mixed with other properties", async () => {
			const functionString = "async (data) => { return data; }";
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "send-email") return functionString;
				if (options.flag === "api-key") return "test-key";
				return undefined;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "send-email",
							description: "Function to send email",
							skipPrompt: true,
							defaultValue: functionString,
							argument: {
								index: 0,
								isProperty: "sendEmail",
								schema: z.coerce.string(),
							},
						},
						{
							flag: "api-key",
							description: "API key",
							skipPrompt: true,
							defaultValue: "test-key",
							argument: {
								index: 0,
								isProperty: "apiKey",
								schema: z.coerce.string(),
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

			// Function should be output as function, other properties as strings
			const expected = await formatPluginCode(
				`testPlugin({ sendEmail: ${functionString}, apiKey: "test-key" })`,
			);
			expect(result).toBe(expected);
		});

		it("should handle function string as direct argument (not property)", async () => {
			const functionString = "(email) => email.toLowerCase()";
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "transform") return functionString;
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "transform",
							description: "Transform function",
							skipPrompt: true,
							defaultValue: functionString,
							argument: {
								index: 0,
								isProperty: false,
								schema: z.coerce.string(),
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

			// Function should be output directly as a function argument
			const expected = await formatPluginCode(`testPlugin(${functionString})`);
			expect(result).toBe(expected);
		});

		it("should handle multiple function strings in same object", async () => {
			const functionString1 = "async (data) => { return data; }";
			const functionString2 = "(email) => email.toLowerCase()";
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "send-email") return functionString1;
				if (options.flag === "transform") return functionString2;
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "send-email",
							description: "Function to send email",
							skipPrompt: true,
							defaultValue: functionString1,
							argument: {
								index: 0,
								isProperty: "sendEmail",
								schema: z.coerce.string(),
							},
						},
						{
							flag: "transform",
							description: "Transform function",
							skipPrompt: true,
							defaultValue: functionString2,
							argument: {
								index: 0,
								isProperty: "transform",
								schema: z.coerce.string(),
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

			// Both functions should be output directly as functions
			const expected = await formatPluginCode(
				`testPlugin({ sendEmail: ${functionString1}, transform: ${functionString2} })`,
			);
			expect(result).toBe(expected);
		});

		it("should handle function string with template literals inside", async () => {
			const functionString = "async (data) => { return `Hello ${data.name}`; }";
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "send-email") return functionString;
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
			};

			const plugin: PluginConfig = {
				displayName: "Test Plugin",
				auth: {
					function: "testPlugin",
					imports: [],
					arguments: [
						{
							flag: "send-email",
							description: "Function to send email",
							skipPrompt: true,
							defaultValue: functionString,
							argument: {
								index: 0,
								isProperty: "sendEmail",
								schema: z.coerce.string(),
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

			// Function with template literals should be output directly as a function
			const expected = await formatPluginCode(
				`testPlugin({ sendEmail: ${functionString} })`,
			);
			expect(result).toBe(expected);
		});
	});

	describe("edge cases", () => {
		it("should handle very large argument values", async () => {
			const largeValue = "a".repeat(1000);
			const getArguments: GetArgumentsFn = async (options) => {
				if (options.flag === "large-arg") return largeValue;
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
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
							description: "Large arg description",
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
				if (options.isRequired && options.defaultValue)
					return options.defaultValue;
				return;
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
							description: "Null arg description",
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

	describe("getAuthClientPluginsCode", () => {
		describe("empty or undefined plugins", () => {
			it("should return undefined when plugins is undefined", async () => {
				const getArguments: GetArgumentsFn = async ({ flag }) => {};
				const result = await getAuthClientPluginsCode({
					plugins: undefined,
					getArguments,
				});
				expect(result).toBeUndefined();
			});

			it("should return undefined when plugins is empty array", async () => {
				const getArguments: GetArgumentsFn = async () => undefined;
				const result = await getAuthClientPluginsCode({
					plugins: [],
					getArguments,
				});
				expect(result).toBeUndefined();
			});

			it("should return undefined when all plugins have authClient null", async () => {
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

				const result = await getAuthClientPluginsCode({
					plugins,
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
					authClient: {
						function: "testPluginClient",
						imports: [],
					},
				};

				const result = await getAuthClientPluginsCode({
					plugins: [plugin],
					getArguments,
				});

				const expected = await formatPluginCode("testPluginClient()");

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
						authClient: {
							function: "plugin1Client",
							imports: [],
						},
					},
					{
						displayName: "Plugin 2",
						auth: {
							function: "plugin2",
							imports: [],
						},
						authClient: {
							function: "plugin2Client",
							imports: [],
						},
					},
				];

				const result = await getAuthClientPluginsCode({
					plugins,
					getArguments,
				});

				const expected = await formatPluginCode(
					"plugin1Client(), plugin2Client()",
				);

				expect(result).toBe(expected);
			});

			it("should filter out plugins with authClient null", async () => {
				const getArguments: GetArgumentsFn = async () => undefined;
				const plugins: PluginConfig[] = [
					{
						displayName: "Plugin 1",
						auth: {
							function: "plugin1",
							imports: [],
						},
						authClient: {
							function: "plugin1Client",
							imports: [],
						},
					},
					{
						displayName: "Plugin 2",
						auth: {
							function: "plugin2",
							imports: [],
						},
						authClient: null,
					},
					{
						displayName: "Plugin 3",
						auth: {
							function: "plugin3",
							imports: [],
						},
						authClient: {
							function: "plugin3Client",
							imports: [],
						},
					},
				];

				const result = await getAuthClientPluginsCode({
					plugins,
					getArguments,
				});

				const expected = await formatPluginCode(
					"plugin1Client(), plugin3Client()",
				);

				expect(result).toBe(expected);
			});
		});

		describe("plugins with single non-property arguments", () => {
			it("should generate code for plugin with single string argument", async () => {
				const getArguments: GetArgumentsFn = async (options) => {
					if (options.flag === "test-arg") return "test-value";
					if (options.isRequired && options.defaultValue)
						return options.defaultValue;
					return;
				};

				const plugin: PluginConfig = {
					displayName: "Test Plugin",
					auth: {
						function: "testPlugin",
						imports: [],
					},
					authClient: {
						function: "testPluginClient",
						imports: [],
						arguments: [
							{
								flag: "test-arg",
								question: "Test question",
								description: "Test description",
								argument: {
									index: 0,
									isProperty: false,
									schema: z.string(),
								},
							},
						],
					},
				};

				const result = await getAuthClientPluginsCode({
					plugins: [plugin],
					getArguments,
				});

				const expected = await formatPluginCode(
					'testPluginClient("test-value")',
				);

				expect(result).toBe(expected);
			});
		});

		describe("plugins with single property arguments", () => {
			it("should generate code for plugin with single property argument", async () => {
				const getArguments: GetArgumentsFn = async (options) => {
					if (options.flag === "test-arg") return "test-value";
					if (options.isRequired && options.defaultValue)
						return options.defaultValue;
					return;
				};

				const plugin: PluginConfig = {
					displayName: "Test Plugin",
					auth: {
						function: "testPlugin",
						imports: [],
					},
					authClient: {
						function: "testPluginClient",
						imports: [],
						arguments: [
							{
								flag: "test-arg",
								question: "Test question",
								description: "Test description",
								argument: {
									index: 0,
									isProperty: "testProperty",
									schema: z.string(),
								},
							},
						],
					},
				};

				const result = await getAuthClientPluginsCode({
					plugins: [plugin],
					getArguments,
				});

				const expected = await formatPluginCode(
					'testPluginClient({"testProperty":"test-value"})',
				);

				expect(result).toBe(expected);
			});
		});

		describe("plugins with multiple property arguments merging", () => {
			it("should merge multiple properties into single object", async () => {
				const getArguments: GetArgumentsFn = async (options) => {
					if (options.flag === "prop1") return "value1";
					if (options.flag === "prop2") return "value2";
					if (options.isRequired && options.defaultValue)
						return options.defaultValue;
					return;
				};

				const plugin: PluginConfig = {
					displayName: "Test Plugin",
					auth: {
						function: "testPlugin",
						imports: [],
					},
					authClient: {
						function: "testPluginClient",
						imports: [],
						arguments: [
							{
								flag: "prop1",
								question: "Property 1",
								description: "Property 1 description",
								argument: {
									index: 0,
									isProperty: "prop1",
									schema: z.string(),
								},
							},
							{
								flag: "prop2",
								question: "Property 2",
								description: "Property 2 description",
								argument: {
									index: 0,
									isProperty: "prop2",
									schema: z.string(),
								},
							},
						],
					},
				};

				const result = await getAuthClientPluginsCode({
					plugins: [plugin],
					getArguments,
				});

				const expected = await formatPluginCode(
					'testPluginClient({"prop1":"value1","prop2":"value2"})',
				);

				expect(result).toBe(expected);
			});
		});

		describe("undefined value filtering", () => {
			it("should remove trailing undefined values", async () => {
				const getArguments: GetArgumentsFn = async (options) => {
					if (options.flag === "arg0") return "value0";
					if (options.isRequired && options.defaultValue)
						return options.defaultValue;
					return;
				};

				const plugin: PluginConfig = {
					displayName: "Test Plugin",
					auth: {
						function: "testPlugin",
						imports: [],
					},
					authClient: {
						function: "testPluginClient",
						imports: [],
						arguments: [
							{
								flag: "arg0",
								question: "Argument 0",
								description: "Argument 0 description",
								argument: {
									index: 0,
									isProperty: false,
									schema: z.string().optional(),
								},
							},
							{
								flag: "arg1",
								question: "Argument 1",
								description: "Argument 1 description",
								argument: {
									index: 1,
									isProperty: false,
									schema: z.string().optional(),
								},
							},
							{
								flag: "arg2",
								question: "Argument 2",
								description: "Argument 2 description",
								argument: {
									index: 2,
									isProperty: false,
									schema: z.string().optional(),
								},
							},
						],
					},
				};

				const result = await getAuthClientPluginsCode({
					plugins: [plugin],
					getArguments,
				});

				const expected = await formatPluginCode('testPluginClient("value0")');

				expect(result).toBe(expected);
			});
		});

		describe("schema validation", () => {
			it("should throw error for invalid schema validation", async () => {
				const getArguments: GetArgumentsFn = async (options) => {
					if (options.flag === "test-arg") return "invalid";
					if (options.isRequired && options.defaultValue)
						return options.defaultValue;
					return;
				};

				const plugin: PluginConfig = {
					displayName: "Test Plugin",
					auth: {
						function: "testPlugin",
						imports: [],
					},
					authClient: {
						function: "testPluginClient",
						imports: [],
						arguments: [
							{
								flag: "test-arg",
								question: "Test question",
								description: "Test description",
								argument: {
									index: 0,
									isProperty: false,
									schema: z.number(),
								},
							},
						],
					},
				};

				await expect(
					getAuthClientPluginsCode({
						plugins: [plugin],
						getArguments,
					}),
				).rejects.toThrow();
			});

			it("should throw error with descriptive message for invalid schema", async () => {
				const getArguments: GetArgumentsFn = async (options) => {
					if (options.flag === "test-arg") return "not-a-number";
					if (options.isRequired && options.defaultValue)
						return options.defaultValue;
					return;
				};

				const plugin: PluginConfig = {
					displayName: "Test Plugin",
					auth: {
						function: "testPlugin",
						imports: [],
					},
					authClient: {
						function: "testPluginClient",
						imports: [],
						arguments: [
							{
								flag: "test-arg",
								question: "Test question",
								description: "Test description",
								argument: {
									index: 0,
									isProperty: false,
									schema: z.number(),
								},
							},
						],
					},
				};

				await expect(
					getAuthClientPluginsCode({
						plugins: [plugin],
						getArguments,
					}),
				).rejects.toThrow(/Invalid argument for testPluginClient/);
			});
		});

		describe("multiple plugins", () => {
			it("should generate code for multiple plugins with arguments", async () => {
				const getArguments: GetArgumentsFn = async (options) => {
					if (options.flag === "plugin1-arg") return "value1";
					if (options.flag === "plugin2-arg") return "value2";
					if (options.isRequired && options.defaultValue)
						return options.defaultValue;
					return;
				};

				const plugins: PluginConfig[] = [
					{
						displayName: "Plugin 1",
						auth: {
							function: "plugin1",
							imports: [],
						},
						authClient: {
							function: "plugin1Client",
							imports: [],
							arguments: [
								{
									flag: "plugin1-arg",
									question: "Plugin 1 arg",
									description: "Plugin 1 arg description",
									argument: {
										index: 0,
										isProperty: false,
										schema: z.string(),
									},
								},
							],
						},
					},
					{
						displayName: "Plugin 2",
						auth: {
							function: "plugin2",
							imports: [],
						},
						authClient: {
							function: "plugin2Client",
							imports: [],
							arguments: [
								{
									flag: "plugin2-arg",
									question: "Plugin 2 arg",
									description: "Plugin 2 arg description",
									argument: {
										index: 0,
										isProperty: false,
										schema: z.string(),
									},
								},
							],
						},
					},
				];

				const result = await getAuthClientPluginsCode({
					plugins,
					getArguments,
				});

				const expected = await formatPluginCode(
					'plugin1Client("value1"), plugin2Client("value2")',
				);

				expect(result).toBe(expected);
			});

			it("should handle mix of plugins with and without authClient", async () => {
				const getArguments: GetArgumentsFn = async (options) => {
					if (options.flag === "plugin1-arg") return "value1";
					if (options.isRequired && options.defaultValue)
						return options.defaultValue;
					return;
				};

				const plugins: PluginConfig[] = [
					{
						displayName: "Plugin 1",
						auth: {
							function: "plugin1",
							imports: [],
						},
						authClient: {
							function: "plugin1Client",
							imports: [],
							arguments: [
								{
									flag: "plugin1-arg",
									question: "Plugin 1 arg",
									description: "Plugin 1 arg description",
									argument: {
										index: 0,
										isProperty: false,
										schema: z.string(),
									},
								},
							],
						},
					},
					{
						displayName: "Plugin 2",
						auth: {
							function: "plugin2",
							imports: [],
						},
						authClient: null,
					},
					{
						displayName: "Plugin 3",
						auth: {
							function: "plugin3",
							imports: [],
						},
						authClient: {
							function: "plugin3Client",
							imports: [],
						},
					},
				];

				const result = await getAuthClientPluginsCode({
					plugins,
					getArguments,
				});

				const expected = await formatPluginCode(
					'plugin1Client("value1"), plugin3Client()',
				);

				expect(result).toBe(expected);
			});
		});

		describe("nested objects", () => {
			it("should handle nested object with single property", async () => {
				const getArguments: GetArgumentsFn = async (options) => {
					if (options.flag === "digits") return 6;
					if (options.isRequired && options.defaultValue)
						return options.defaultValue;
					return;
				};

				const plugin: PluginConfig = {
					displayName: "Test Plugin",
					auth: {
						function: "testPlugin",
						imports: [],
					},
					authClient: {
						function: "testPluginClient",
						imports: [],
						arguments: [
							{
								flag: "totp",
								description: "TOTP configuration",
								skipPrompt: true,
								isNestedObject: [
									{
										flag: "digits",
										question: "Number of digits",
										description: "Number of digits for TOTP",
										defaultValue: 6,
										skipPrompt: true,
										argument: {
											index: 0,
											isProperty: "digits",
											schema: z.coerce.number().min(6).max(8).optional(),
										},
									},
								],
								argument: {
									index: 0,
									isProperty: "totp",
								},
							},
						],
					},
				};

				const result = await getAuthClientPluginsCode({
					plugins: [plugin],
					getArguments,
				});

				const expected = await formatPluginCode(
					'testPluginClient({"totp":{"digits":6}})',
				);
				expect(result).toBe(expected);
			});
		});

		describe("function string handling", () => {
			it("should output function string as actual function, not string", async () => {
				const functionString = "async (data) => { return data; }";
				const getArguments: GetArgumentsFn = async (options) => {
					if (options.flag === "send-email") return functionString;
					return undefined;
				};

				const plugin: PluginConfig = {
					displayName: "Test Plugin",
					auth: {
						function: "testPlugin",
						imports: [],
					},
					authClient: {
						function: "testPluginClient",
						imports: [],
						arguments: [
							{
								flag: "send-email",
								description: "Function to send email",
								skipPrompt: true,
								defaultValue: functionString,
								argument: {
									index: 0,
									isProperty: "sendEmail",
									schema: z.coerce.string(),
								},
							},
						],
					},
				};

				const result = await getAuthClientPluginsCode({
					plugins: [plugin],
					getArguments,
				});

				// Function should be output directly, not as a template literal string
				const expected = await formatPluginCode(
					`testPluginClient({ sendEmail: ${functionString} })`,
				);
				expect(result).toBe(expected);
			});
		});

		describe("real-world plugin examples", () => {
			it("should generate code for twoFactorClient plugin", async () => {
				const getArguments: GetArgumentsFn = async (options) => {
					if (options.isRequired && options.defaultValue)
						return options.defaultValue;
					return;
				};

				const result = await getAuthClientPluginsCode({
					plugins: [tempPluginsConfig.twoFactor],
					getArguments,
				});

				expect(result).toContain("twoFactorClient");
			});

			it("should generate code for multiple real plugins with client versions", async () => {
				const getArguments: GetArgumentsFn = async (options) => {
					if (options.isRequired && options.defaultValue)
						return options.defaultValue;
					return;
				};

				const result = await getAuthClientPluginsCode({
					plugins: [
						tempPluginsConfig.twoFactor,
						tempPluginsConfig.username,
						tempPluginsConfig.magicLink,
					],
					getArguments,
				});

				expect(result).toContain("twoFactorClient");
				expect(result).toContain("usernameClient");
				expect(result).toContain("magicLinkClient");
			});

			it("should filter out plugins without client versions", async () => {
				const getArguments: GetArgumentsFn = async (options) => {
					if (options.isRequired && options.defaultValue)
						return options.defaultValue;
					return;
				};

				// captcha has authClient: null
				const result = await getAuthClientPluginsCode({
					plugins: [
						tempPluginsConfig.twoFactor,
						tempPluginsConfig.captcha,
						tempPluginsConfig.username,
					],
					getArguments,
				});

				expect(result).toContain("twoFactorClient");
				expect(result).toContain("usernameClient");
				expect(result).not.toContain("captcha");
			});
		});
	});
});
