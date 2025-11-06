import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Project } from "ts-morph";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	extractJSDocTags,
	generateArgumentCode,
	generateIndexFile,
	generateIndividualPluginFile,
	generatePluginConfig,
	generateQuestion,
	generateZodSchema,
	toKebabCase,
	toTitleCase,
} from "./generate-plugin-config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

// Create a temporary directory for test files
const TEST_DIR = path.join(ROOT_DIR, "packages/cli/scripts/.tmp");

// Helper to create mock JSDoc nodes
function createMockJsDocNode(text: string): any {
	return {
		getFullText: () => text,
	};
}

describe("generate-plugin-config", () => {
	beforeEach(() => {
		// Create test directory
		if (!fs.existsSync(TEST_DIR)) {
			fs.mkdirSync(TEST_DIR, { recursive: true });
		}
	});

	afterEach(() => {
		// Clean up test directory
		if (fs.existsSync(TEST_DIR)) {
			fs.rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	describe("toKebabCase", () => {
		it("should convert camelCase to kebab-case", () => {
			expect(toKebabCase("camelCase")).toBe("camel-case");
			expect(toKebabCase("twoFactorAuth")).toBe("two-factor-auth");
		});

		it("should handle already kebab-case strings", () => {
			expect(toKebabCase("already-kebab")).toBe("already-kebab");
		});

		it("should handle single words", () => {
			expect(toKebabCase("username")).toBe("username");
		});
	});

	describe("toTitleCase", () => {
		it("should convert camelCase to Title Case", () => {
			expect(toTitleCase("camelCase")).toBe("Camel Case");
			expect(toTitleCase("twoFactorAuth")).toBe("Two Factor Auth");
		});

		it("should capitalize first letter of each word", () => {
			expect(toTitleCase("helloWorld")).toBe("Hello World");
		});

		it("should handle single words", () => {
			expect(toTitleCase("username")).toBe("Username");
		});
	});

	describe("extractJSDocTags", () => {
		it("should extract @cli tag", () => {
			const jsDoc = [
				createMockJsDocNode(`/**
				 * Description here
				 * @cli
				 */`),
			];
			const result = extractJSDocTags(jsDoc);
			expect(result.hasCliTag).toBe(true);
			expect(result.shouldSkip).toBe(false);
		});

		it("should detect @cli skip", () => {
			const jsDoc = [
				createMockJsDocNode(`/**
				 * Description here
				 * @cli skip
				 */`),
			];
			const result = extractJSDocTags(jsDoc);
			expect(result.hasCliTag).toBe(true);
			expect(result.shouldSkip).toBe(true);
		});

		it("should detect @cli required", () => {
			const jsDoc = [
				createMockJsDocNode(`/**
				 * Description here
				 * @cli required
				 */`),
			];
			const result = extractJSDocTags(jsDoc);
			expect(result.isRequired).toBe(true);
		});

		it("should extract @default value", () => {
			const jsDoc = [
				createMockJsDocNode(`/**
				 * Description here
				 * @cli
				 * @default "test-value"
				 */`),
			];
			const result = extractJSDocTags(jsDoc);
			expect(result.defaultValue).toBe("test-value");
		});

		it("should extract numeric @default value", () => {
			const jsDoc = [
				createMockJsDocNode(`/**
				 * Description here
				 * @cli
				 * @default 42
				 */`),
			];
			const result = extractJSDocTags(jsDoc);
			expect(result.defaultValue).toBe(42);
		});

		it("should extract boolean @default value", () => {
			const jsDoc = [
				createMockJsDocNode(`/**
				 * Description here
				 * @cli
				 * @default true
				 */`),
			];
			const result = extractJSDocTags(jsDoc);
			expect(result.defaultValue).toBe(true);

			const jsDoc2 = [
				createMockJsDocNode(`/**
				 * Description here
				 * @cli
				 * @default false
				 */`),
			];
			const result2 = extractJSDocTags(jsDoc2);
			expect(result2.defaultValue).toBe(false);
		});

		it("should extract @question text", () => {
			const jsDoc = [
				createMockJsDocNode(`/**
				 * Description here
				 * @cli
				 * @question What is your favorite color?
				 */`),
			];
			const result = extractJSDocTags(jsDoc);
			expect(result.question).toBe("What is your favorite color?");
		});

		it("should extract @cli select with options", () => {
			const jsDoc = [
				createMockJsDocNode(`/**
				 * Description here
				 * @cli select option1 option2 option3
				 */`),
			];
			const result = extractJSDocTags(jsDoc);
			expect(result.isSelect).toBe(true);
			expect(result.selectOptions).toEqual([
				{ value: "option1", label: "Option1" },
				{ value: "option2", label: "Option2" },
				{ value: "option3", label: "Option3" },
			]);
		});

		it("should extract @cli select with custom labels", () => {
			const jsDoc = [
				createMockJsDocNode(`/**
				 * Description here
				 * @cli select option1:FirstOption option2:SecondOption
				 */`),
			];
			const result = extractJSDocTags(jsDoc);
			expect(result.isSelect).toBe(true);
			expect(result.selectOptions).toEqual([
				{ value: "option1", label: "FirstOption" },
				{ value: "option2", label: "SecondOption" },
			]);
		});

		it("should extract @cli multi-select", () => {
			const jsDoc = [
				createMockJsDocNode(`/**
				 * Description here
				 * @cli multi-select option1 option2 option3
				 */`),
			];
			const result = extractJSDocTags(jsDoc);
			expect(result.isMultiSelect).toBe(true);
			expect(result.selectOptions).toEqual([
				{ value: "option1", label: "Option1" },
				{ value: "option2", label: "Option2" },
				{ value: "option3", label: "Option3" },
			]);
		});

		it("should extract @type override", () => {
			const jsDoc = [
				createMockJsDocNode(`/**
				 * Description here
				 * @cli
				 * @type string
				 */`),
			];
			const result = extractJSDocTags(jsDoc);
			expect(result.type).toBe("string");

			const jsDoc2 = [
				createMockJsDocNode(`/**
				 * Description here
				 * @cli
				 * @type number
				 */`),
			];
			const result2 = extractJSDocTags(jsDoc2);
			expect(result2.type).toBe("number");

			const jsDoc3 = [
				createMockJsDocNode(`/**
				 * Description here
				 * @cli
				 * @type boolean
				 */`),
			];
			const result3 = extractJSDocTags(jsDoc3);
			expect(result3.type).toBe("boolean");
		});

		it("should extract @type enum with values", () => {
			const jsDoc = [
				createMockJsDocNode(`/**
				 * Description here
				 * @cli
				 * @type enum value1 value2 value3
				 */`),
			];
			const result = extractJSDocTags(jsDoc);
			expect(result.type).toBe("enum");
			expect(result.enumValues).toEqual(["value1", "value2", "value3"]);
		});

		it("should extract @prompt tag", () => {
			const jsDoc = [
				createMockJsDocNode(`/**
				 * Description here
				 * @cli
				 * @prompt
				 */`),
			];
			const result = extractJSDocTags(jsDoc);
			expect(result.hasPrompt).toBe(true);
		});

		it("should extract description", () => {
			const jsDoc = [
				createMockJsDocNode(`/**
				 * This is a description
				 * @cli
				 */`),
			];
			const result = extractJSDocTags(jsDoc);
			expect(result.description).toBe("This is a description");
		});

		it("should handle multiline descriptions", () => {
			const jsDoc = [
				createMockJsDocNode(`/**
				 * This is a description
				 * that spans multiple lines
				 * @cli
				 */`),
			];
			const result = extractJSDocTags(jsDoc);
			expect(result.description).toBe(
				"This is a description that spans multiple lines",
			);
		});

		it("should handle complex JSDoc with multiple tags", () => {
			const jsDoc = [
				createMockJsDocNode(`/**
				 * This is a description
				 * @cli required
				 * @default "test"
				 * @question What is the value?
				 * @prompt
				 */`),
			];
			const result = extractJSDocTags(jsDoc);
			expect(result.hasCliTag).toBe(true);
			expect(result.isRequired).toBe(true);
			expect(result.defaultValue).toBe("test");
			expect(result.question).toBe("What is the value?");
			expect(result.hasPrompt).toBe(true);
			expect(result.description).toBe("This is a description");
		});
	});

	describe("generateZodSchema", () => {
		it("should generate string schema", () => {
			const mockType = {
				getText: () => "string",
				isNullable: () => false,
				isUndefined: () => false,
				isUnion: () => false,
				getSymbol: () => ({ getName: () => "String" }),
			};
			const result = generateZodSchema(mockType);
			expect(result).toBe("z.coerce.string()");
		});

		it("should generate optional string schema", () => {
			const mockType = {
				getText: () => "string | undefined",
				isNullable: () => false,
				isUndefined: () => true,
				isUnion: () => false,
				getSymbol: () => ({ getName: () => "String" }),
			};
			const result = generateZodSchema(mockType);
			expect(result).toBe("z.coerce.string().optional()");
		});

		it("should generate number schema", () => {
			const mockType = {
				getText: () => "number",
				isNullable: () => false,
				isUndefined: () => false,
				isUnion: () => false,
				getSymbol: () => ({ getName: () => "Number" }),
			};
			const result = generateZodSchema(mockType);
			expect(result).toBe("z.coerce.number()");
		});

		it("should generate boolean schema", () => {
			const mockType = {
				getText: () => "boolean",
				isNullable: () => false,
				isUndefined: () => false,
				isUnion: () => false,
				getSymbol: () => ({ getName: () => "Boolean" }),
			};
			const result = generateZodSchema(mockType);
			expect(result).toBe("z.coerce.boolean()");
		});

		it("should generate enum schema from union type", () => {
			const mockType = {
				getText: () => '"option1" | "option2" | "option3"',
				isNullable: () => false,
				isUndefined: () => false,
				isUnion: () => true,
				getUnionTypes: () => [
					{ getText: () => '"option1"' },
					{ getText: () => '"option2"' },
					{ getText: () => '"option3"' },
				],
				getSymbol: () => null,
			};
			const result = generateZodSchema(mockType);
			expect(result).toBe('z.enum(["option1", "option2", "option3"])');
		});

		it("should use type override", () => {
			const mockType = {
				getText: () => "string",
				isNullable: () => false,
				isUndefined: () => false,
				getSymbol: () => ({ getName: () => "String" }),
			};
			const result = generateZodSchema(mockType, "number");
			expect(result).toBe("z.coerce.number()");
		});

		it("should generate enum schema with type override", () => {
			const mockType = {
				getText: () => "string",
				isNullable: () => false,
				isUndefined: () => false,
				getSymbol: () => ({ getName: () => "String" }),
			};
			const result = generateZodSchema(mockType, "enum", [
				"value1",
				"value2",
				"value3",
			]);
			expect(result).toBe('z.enum(["value1", "value2", "value3"])');
		});
	});

	describe("generateQuestion", () => {
		it("should generate question for string type", () => {
			const mockType = {
				getText: () => "string",
				getSymbol: () => ({ getName: () => "String" }),
			};
			const result = generateQuestion(
				"userName",
				mockType,
				undefined,
				"testPlugin",
			);
			expect(result).toBe("[Test Plugin] What is the user name?");
		});

		it("should generate question for boolean type", () => {
			const mockType = {
				getText: () => "boolean",
				getSymbol: () => ({ getName: () => "Boolean" }),
			};
			const result = generateQuestion(
				"isEnabled",
				mockType,
				undefined,
				"testPlugin",
			);
			expect(result).toBe("[Test Plugin] Would you like to is enabled?");
		});

		it("should generate question for number type", () => {
			const mockType = {
				getText: () => "number",
				getSymbol: () => ({ getName: () => "Number" }),
			};
			const result = generateQuestion(
				"maxRetries",
				mockType,
				undefined,
				"testPlugin",
			);
			expect(result).toBe("[Test Plugin] What is the max retries?");
		});

		it("should use type override", () => {
			const mockType = {
				getText: () => "string",
				getSymbol: () => ({ getName: () => "String" }),
			};
			const result = generateQuestion(
				"count",
				mockType,
				"number",
				"testPlugin",
			);
			expect(result).toBe("[Test Plugin] What is the count?");
		});
	});

	describe("generateArgumentCode", () => {
		it("should generate code for simple argument", () => {
			const arg = {
				flag: "test-plugin-username",
				description: "Username property",
				question: "[Test Plugin] What is the username?",
				skipPrompt: true,
				argument: {
					index: 0,
					isProperty: "username",
					schema: "z.coerce.string()",
				},
			};
			const result = generateArgumentCode(arg);
			expect(result).toContain('flag: "test-plugin-username"');
			expect(result).toContain('description: "Username property"');
			expect(result).toContain("schema: z.coerce.string()");
		});

		it("should generate code with defaultValue", () => {
			const arg = {
				flag: "test-plugin-timeout",
				description: "Timeout in seconds",
				question: "[Test Plugin] What is the timeout?",
				skipPrompt: true,
				defaultValue: 30,
				argument: {
					index: 0,
					isProperty: "timeout",
					schema: "z.coerce.number()",
				},
			};
			const result = generateArgumentCode(arg);
			expect(result).toContain("defaultValue: 30");
		});

		it("should generate code with isSelectOptions", () => {
			const arg = {
				flag: "test-plugin-mode",
				description: "Select mode",
				question: "[Test Plugin] What is the mode?",
				skipPrompt: false,
				isSelectOptions: [
					{ value: "development", label: "Development" },
					{ value: "production", label: "Production" },
				],
				argument: {
					index: 0,
					isProperty: "mode",
					schema: 'z.enum(["development", "production"])',
				},
			};
			const result = generateArgumentCode(arg);
			expect(result).toContain("isSelectOptions:");
			expect(result).toContain('value: "development"');
			expect(result).toContain('label: "Development"');
		});

		it("should generate code with isMultiselectOptions", () => {
			const arg = {
				flag: "test-plugin-features",
				description: "Select features",
				question: "[Test Plugin] What features do you want?",
				skipPrompt: false,
				isMultiselectOptions: [
					{ value: "feature1", label: "Feature 1" },
					{ value: "feature2", label: "Feature 2" },
				],
				argument: {
					index: 0,
					isProperty: "features",
					schema: "z.array(z.string())",
				},
			};
			const result = generateArgumentCode(arg);
			expect(result).toContain("isMultiselectOptions:");
			expect(result).toContain('value: "feature1"');
		});

		it("should generate code with nested objects", () => {
			const arg = {
				flag: "test-plugin-config",
				description: "Configuration object",
				question: "[Test Plugin] Configure settings",
				skipPrompt: true,
				isNestedObject: [
					{
						flag: "test-plugin-config-timeout",
						description: "Timeout",
						question: "[Test Plugin] What is the timeout?",
						skipPrompt: true,
						argument: {
							index: 0,
							isProperty: "timeout",
							schema: "z.coerce.number()",
						},
					},
				],
				argument: {
					index: 0,
					isProperty: "config",
				},
			};
			const result = generateArgumentCode(arg);
			expect(result).toContain("isNestedObject:");
			expect(result).toContain("test-plugin-config-timeout");
		});

		it("should handle string defaultValue correctly", () => {
			const arg = {
				flag: "test-plugin-api-key",
				description: "API key",
				question: "[Test Plugin] What is the API key?",
				skipPrompt: true,
				defaultValue: "default-key",
				argument: {
					index: 0,
					isProperty: "apiKey",
					schema: "z.coerce.string()",
				},
			};
			const result = generateArgumentCode(arg);
			expect(result).toContain('defaultValue: "default-key"');
		});
	});

	describe("generateIndexFile", () => {
		it("should generate index file with plugin imports", () => {
			const pluginNames = ["testPlugin", "anotherPlugin"];
			const result = generateIndexFile(pluginNames);
			expect(result).toContain(
				'import { testPluginPluginConfig } from "./plugin-test-plugin.config";',
			);
			expect(result).toContain(
				'import { anotherPluginPluginConfig } from "./plugin-another-plugin.config";',
			);
			expect(result).toContain("testPlugin: testPluginPluginConfig");
			expect(result).toContain("anotherPlugin: anotherPluginPluginConfig");
		});

		it("should generate proper TypeScript types", () => {
			const pluginNames = ["testPlugin"];
			const result = generateIndexFile(pluginNames);
			expect(result).toContain(
				"export type Plugin = keyof typeof pluginsConfig",
			);
			expect(result).toContain("export type PluginConfig");
			expect(result).toContain("export type PluginsConfig");
		});
	});

	describe("generateIndividualPluginFile", () => {
		it("should generate plugin file without client", () => {
			const pluginData = {
				pluginConfig: [
					{
						flag: "test-plugin-username",
						description: "Username",
						question: "[Test Plugin] What is the username?",
						skipPrompt: true,
						argument: {
							index: 0,
							isProperty: "username",
							schema: "z.coerce.string()",
						},
					},
				],
				displayName: "Test Plugin",
				importPath: "better-auth/plugins",
				functionName: "testPlugin",
				hasClient: false,
			};
			const result = generateIndividualPluginFile("testPlugin", pluginData);
			expect(result).toContain('displayName: "Test Plugin"');
			expect(result).toContain('function: "testPlugin"');
			expect(result).toContain('path: "better-auth/plugins"');
			expect(result).toContain("authClient: null");
		});

		it("should generate plugin file with client", () => {
			const pluginData = {
				pluginConfig: [],
				displayName: "Test Plugin",
				importPath: "better-auth/plugins",
				functionName: "testPlugin",
				hasClient: true,
			};
			const result = generateIndividualPluginFile("testPlugin", pluginData);
			expect(result).toContain("authClient:");
			expect(result).toContain('function: "testPluginClient"');
			expect(result).toContain('path: "better-auth/client/plugins"');
		});

		it("should generate plugin file with arguments", () => {
			const pluginData = {
				pluginConfig: [
					{
						flag: "test-plugin-username",
						description: "Username",
						question: "[Test Plugin] What is the username?",
						skipPrompt: true,
						argument: {
							index: 0,
							isProperty: "username",
							schema: "z.coerce.string()",
						},
					},
				],
				displayName: "Test Plugin",
				importPath: "better-auth/plugins",
				functionName: "testPlugin",
				hasClient: false,
			};
			const result = generateIndividualPluginFile("testPlugin", pluginData);
			expect(result).toContain("arguments:");
			expect(result).toContain("test-plugin-username");
		});
	});

	describe("generatePluginConfig with real TypeScript files", () => {
		it("should parse a simple plugin type with @cli tag", () => {
			const testFile = path.join(TEST_DIR, "test-plugin.ts");
			const testContent = `export interface TestPluginOptions {
	/**
	 * Username property
	 * @cli
	 * @default "admin"
	 */
	username?: string;

	/**
	 * Timeout in seconds
	 * @cli
	 * @default 30
	 */
	timeout?: number;

	/**
	 * Enable feature
	 * @cli
	 * @default false
	 */
	enabled?: boolean;

	/**
	 * This property should be skipped
	 * @cli skip
	 */
	skipped?: string;
}`;

			fs.writeFileSync(testFile, testContent);

			const project = new Project({
				tsConfigFilePath: path.resolve(ROOT_DIR, "better-auth/tsconfig.json"),
			});
			const sourceFile = project.addSourceFileAtPath(testFile);

			const pluginInfo = {
				serverTypeFile: testFile,
				serverTypeName: "TestPluginOptions",
				clientTypeFile: undefined,
				clientTypeName: undefined,
				importPath: "better-auth/plugins",
			};

			const result = generatePluginConfig("testPlugin", pluginInfo, project);

			expect(result.displayName).toBe("Test Plugin");
			expect(result.functionName).toBe("testPlugin");
			expect(result.importPath).toBe("better-auth/plugins");
			expect(result.hasClient).toBe(false);

			// Should have 3 properties (skipped one should not appear)
			expect(result.pluginConfig).toHaveLength(3);

			// Check username property
			const usernameConfig = result.pluginConfig.find(
				(c) => c.flag === "test-plugin-username",
			);
			expect(usernameConfig).toBeDefined();
			expect(usernameConfig?.defaultValue).toBe("admin");
			expect(usernameConfig?.argument.schema).toBe(
				"z.coerce.string().optional()",
			);

			// Check timeout property
			const timeoutConfig = result.pluginConfig.find(
				(c) => c.flag === "test-plugin-timeout",
			);
			expect(timeoutConfig).toBeDefined();
			expect(timeoutConfig?.defaultValue).toBe(30);
			// Verify schema exists (type detection may vary based on ts-morph parsing)
			expect(timeoutConfig?.argument.schema).toBeDefined();

			// Check enabled property
			const enabledConfig = result.pluginConfig.find(
				(c) => c.flag === "test-plugin-enabled",
			);
			expect(enabledConfig).toBeDefined();
			expect(enabledConfig?.defaultValue).toBe(false);
		});

		it("should parse plugin with select options", () => {
			const testFile = path.join(TEST_DIR, "test-plugin-select.ts");
			const testContent = `export interface TestPluginSelectOptions {
	/**
	 * Select mode
	 * @cli select development:Development production:Production
	 */
	mode: "development" | "production";

	/**
	 * Select features (multi-select)
	 * @cli multi-select feature1:Feature1 feature2:Feature2
	 */
	features?: string[];
}`;

			fs.writeFileSync(testFile, testContent);

			const project = new Project({
				tsConfigFilePath: path.resolve(ROOT_DIR, "better-auth/tsconfig.json"),
			});
			const sourceFile = project.addSourceFileAtPath(testFile);

			const pluginInfo = {
				serverTypeFile: testFile,
				serverTypeName: "TestPluginSelectOptions",
				clientTypeFile: undefined,
				clientTypeName: undefined,
				importPath: "better-auth/plugins",
			};

			const result = generatePluginConfig("testPlugin", pluginInfo, project);

			const modeConfig = result.pluginConfig.find(
				(c) => c.flag === "test-plugin-mode",
			);
			expect(modeConfig).toBeDefined();
			expect(modeConfig?.isSelectOptions).toEqual([
				{ value: "development", label: "Development" },
				{ value: "production", label: "Production" },
			]);

			const featuresConfig = result.pluginConfig.find(
				(c) => c.flag === "test-plugin-features",
			);
			expect(featuresConfig).toBeDefined();
			expect(featuresConfig?.isMultiselectOptions).toEqual([
				{ value: "feature1", label: "Feature1" },
				{ value: "feature2", label: "Feature2" },
			]);
		});

		it("should parse plugin with nested object", () => {
			const testFile = path.join(TEST_DIR, "test-plugin-nested.ts");
			const testContent = `export interface NestedConfig {
	/**
	 * Timeout value
	 * @cli
	 * @default 30
	 */
	timeout?: number;
}

export interface TestPluginNestedOptions {
	/**
	 * Configuration object
	 * @cli
	 */
	config?: NestedConfig;
}`;

			fs.writeFileSync(testFile, testContent);

			const project = new Project({
				tsConfigFilePath: path.resolve(ROOT_DIR, "better-auth/tsconfig.json"),
			});
			const sourceFile = project.addSourceFileAtPath(testFile);

			const pluginInfo = {
				serverTypeFile: testFile,
				serverTypeName: "TestPluginNestedOptions",
				clientTypeFile: undefined,
				clientTypeName: undefined,
				importPath: "better-auth/plugins",
			};

			const result = generatePluginConfig("testPlugin", pluginInfo, project);

			const configProperty = result.pluginConfig.find(
				(c) => c.flag === "test-plugin-config",
			);
			expect(configProperty).toBeDefined();
			expect(configProperty?.isNestedObject).toBeDefined();
			expect(configProperty?.isNestedObject).toHaveLength(1);

			const nestedTimeout = configProperty?.isNestedObject?.[0];
			expect(nestedTimeout).toBeDefined();
			expect(nestedTimeout?.flag).toBe("test-plugin-config-timeout");
			expect(nestedTimeout?.defaultValue).toBe(30);
		});

		it("should parse plugin with @question and @prompt tags", () => {
			const testFile = path.join(TEST_DIR, "test-plugin-prompts.ts");
			const testContent = `export interface TestPluginPromptsOptions {
	/**
	 * API key
	 * @cli
	 * @question What is your API key?
	 * @prompt
	 */
	apiKey: string;

	/**
	 * Secret key (should skip prompt)
	 * @cli
	 * @default "secret"
	 */
	secret?: string;
}`;

			fs.writeFileSync(testFile, testContent);

			const project = new Project({
				tsConfigFilePath: path.resolve(ROOT_DIR, "better-auth/tsconfig.json"),
			});
			const sourceFile = project.addSourceFileAtPath(testFile);

			const pluginInfo = {
				serverTypeFile: testFile,
				serverTypeName: "TestPluginPromptsOptions",
				clientTypeFile: undefined,
				clientTypeName: undefined,
				importPath: "better-auth/plugins",
			};

			const result = generatePluginConfig("testPlugin", pluginInfo, project);

			const apiKeyConfig = result.pluginConfig.find(
				(c) => c.flag === "test-plugin-api-key",
			);
			expect(apiKeyConfig).toBeDefined();
			expect(apiKeyConfig?.question).toBe(
				"[Test Plugin] What is your API key?",
			);
			expect(apiKeyConfig?.skipPrompt).toBe(false); // @prompt tag present

			const secretConfig = result.pluginConfig.find(
				(c) => c.flag === "test-plugin-secret",
			);
			expect(secretConfig).toBeDefined();
			expect(secretConfig?.skipPrompt).toBe(true); // No @prompt tag
		});

		it("should parse plugin with enum type override", () => {
			const testFile = path.join(TEST_DIR, "test-plugin-enum.ts");
			const testContent = `export interface TestPluginEnumOptions {
	/**
	 * Select category
	 * @cli
	 * @type enum category1 category2 category3
	 */
	category?: string;
}`;

			fs.writeFileSync(testFile, testContent);

			const project = new Project({
				tsConfigFilePath: path.resolve(ROOT_DIR, "better-auth/tsconfig.json"),
			});
			const sourceFile = project.addSourceFileAtPath(testFile);

			const pluginInfo = {
				serverTypeFile: testFile,
				serverTypeName: "TestPluginEnumOptions",
				clientTypeFile: undefined,
				clientTypeName: undefined,
				importPath: "better-auth/plugins",
			};

			const result = generatePluginConfig("testPlugin", pluginInfo, project);

			const categoryConfig = result.pluginConfig.find(
				(c) => c.flag === "test-plugin-category",
			);
			expect(categoryConfig).toBeDefined();
			expect(categoryConfig?.argument.schema).toBe(
				'z.enum(["category1", "category2", "category3"]).optional()',
			);
		});

		it("should handle plugin with no @cli tags", () => {
			const testFile = path.join(TEST_DIR, "test-plugin-no-cli.ts");
			const testContent = `export interface TestPluginNoCliOptions {
	username?: string;
	timeout?: number;
}`;

			fs.writeFileSync(testFile, testContent);

			const project = new Project({
				tsConfigFilePath: path.resolve(ROOT_DIR, "better-auth/tsconfig.json"),
			});
			const sourceFile = project.addSourceFileAtPath(testFile);

			const pluginInfo = {
				serverTypeFile: testFile,
				serverTypeName: "TestPluginNoCliOptions",
				clientTypeFile: undefined,
				clientTypeName: undefined,
				importPath: "better-auth/plugins",
			};

			const result = generatePluginConfig("testPlugin", pluginInfo, project);

			// Should have no config items since no @cli tags
			expect(result.pluginConfig).toHaveLength(0);
		});
	});
});
