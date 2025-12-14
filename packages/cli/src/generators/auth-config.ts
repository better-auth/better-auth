import type { spinner as clackSpinner } from "@clack/prompts";
import type { SupportedDatabases, SupportedPlugin } from "../commands/init";

export type Import = {
	path: string;
	variables:
		| { asType?: boolean; name: string; as?: string }[]
		| { asType?: boolean; name: string; as?: string };
};

type Format = (code: string) => Promise<string>;

type CommonIndexConfig_Regex<AdditionalFields> = {
	type: "regex";
	regex: RegExp;
	getIndex: (args: {
		matchIndex: number;
		match: RegExpMatchArray;
		additionalFields: AdditionalFields;
	}) => number | null;
};
type CommonIndexConfig_manual<AdditionalFields> = {
	type: "manual";
	getIndex: (args: {
		content: string;
		additionalFields: AdditionalFields;
	}) => number | null;
};

export type CommonIndexConfig<AdditionalFields> =
	| CommonIndexConfig_Regex<AdditionalFields>
	| CommonIndexConfig_manual<AdditionalFields>;

export async function generateAuthConfig({
	format,
	current_user_config,
	spinner,
	plugins,
	database,
}: {
	format: Format;
	current_user_config: string;
	spinner: ReturnType<typeof clackSpinner>;
	plugins: SupportedPlugin[];
	database: SupportedDatabases | null;
}): Promise<{
	generatedCode: string;
	dependencies: string[];
	envs: string[];
}> {
	let _start_of_plugins_common_index = {
		START_OF_PLUGINS: {
			type: "regex",
			regex: /betterAuth\([\w\W]*plugins:[\W]*\[()/m,
			getIndex: ({ matchIndex, match }) => {
				return matchIndex + match[0].length;
			},
		} satisfies CommonIndexConfig<{}>,
	};
	const common_indexes = {
		START_OF_PLUGINS:
			_start_of_plugins_common_index.START_OF_PLUGINS satisfies CommonIndexConfig<{}>,
		END_OF_PLUGINS: {
			type: "manual",
			getIndex: ({ content, additionalFields }) => {
				const closingBracketIndex = findClosingBracket(
					content,
					additionalFields.start_of_plugins,
					"[",
					"]",
				);
				return closingBracketIndex;
			},
		} satisfies CommonIndexConfig<{ start_of_plugins: number }>,
		START_OF_BETTERAUTH: {
			type: "regex",
			regex: /betterAuth\({()/m,
			getIndex: ({ matchIndex }) => {
				return matchIndex + "betterAuth({".length;
			},
		} satisfies CommonIndexConfig<{}>,
	};

	const config_generation = {
		add_plugin: async (opts: {
			direction_in_plugins_array: "append" | "prepend";
			pluginFunctionName: string;
			pluginContents: string;
			config: string;
		}): Promise<{ code: string; dependencies: string[]; envs: string[] }> => {
			let start_of_plugins = getGroupInfo(
				opts.config,
				common_indexes.START_OF_PLUGINS,
				{},
			);

			// console.log(`start of plugins:`, start_of_plugins);

			if (!start_of_plugins) {
				throw new Error(
					"Couldn't find start of your plugins array in your auth config file.",
				);
			}
			let end_of_plugins = getGroupInfo(
				opts.config,
				common_indexes.END_OF_PLUGINS,
				{ start_of_plugins: start_of_plugins.index },
			);

			// console.log(`end of plugins:`, end_of_plugins);

			if (!end_of_plugins) {
				throw new Error(
					"Couldn't find end of your plugins array in your auth config file.",
				);
			}
			// console.log(
			// 	"slice:\n",
			// 	opts.config.slice(start_of_plugins.index, end_of_plugins.index),
			// );
			let new_content: string;

			if (opts.direction_in_plugins_array === "prepend") {
				new_content = insertContent({
					line: start_of_plugins.line,
					character: start_of_plugins.character,
					content: opts.config,
					insert_content: `${opts.pluginFunctionName}(${opts.pluginContents}),`,
				});
			} else {
				const pluginArrayContent = opts.config
					.slice(start_of_plugins.index, end_of_plugins.index)
					.trim();
				const isPluginArrayEmpty = pluginArrayContent === "";
				const isPluginArrayEndsWithComma = pluginArrayContent.endsWith(",");
				const needsComma = !isPluginArrayEmpty && !isPluginArrayEndsWithComma;

				new_content = insertContent({
					line: end_of_plugins.line,
					character: end_of_plugins.character,
					content: opts.config,
					insert_content: `${needsComma ? "," : ""}${opts.pluginFunctionName}(${
						opts.pluginContents
					})`,
				});
			}

			// console.log(`new_content`, new_content);
			try {
				new_content = await format(new_content);
			} catch (error) {
				console.error(error);
				throw new Error(
					`Failed to generate new auth config during plugin addition phase.`,
				);
			}
			return { code: new_content, dependencies: [], envs: [] };
		},
		add_import: async (opts: {
			imports: Import[];
			config: string;
		}): Promise<{ code: string; dependencies: string[]; envs: string[] }> => {
			let importString = "";
			for (const import_ of opts.imports) {
				if (Array.isArray(import_.variables)) {
					importString += `import { ${import_.variables
						.map(
							(x) =>
								`${x.asType ? "type " : ""}${x.name}${
									x.as ? ` as ${x.as}` : ""
								}`,
						)
						.join(", ")} } from "${import_.path}";\n`;
				} else {
					importString += `import ${import_.variables.asType ? "type " : ""}${
						import_.variables.name
					}${import_.variables.as ? ` as ${import_.variables.as}` : ""} from "${
						import_.path
					}";\n`;
				}
			}
			try {
				let new_content = format(importString + opts.config);
				return { code: await new_content, dependencies: [], envs: [] };
			} catch (error) {
				console.error(error);
				throw new Error(
					`Failed to generate new auth config during import addition phase.`,
				);
			}
		},
		add_database: async (opts: {
			database: SupportedDatabases;
			config: string;
		}): Promise<{ code: string; dependencies: string[]; envs: string[] }> => {
			const required_envs: string[] = [];
			const required_deps: string[] = [];
			let database_code_str: string = "";

			async function add_db({
				db_code,
				dependencies,
				envs,
				imports,
				code_before_betterAuth,
			}: {
				imports: Import[];
				db_code: string;
				envs: string[];
				dependencies: string[];
				/**
				 * Any code you want to put before the betterAuth export
				 */
				code_before_betterAuth?: string;
			}) {
				if (code_before_betterAuth) {
					let start_of_betterauth = getGroupInfo(
						opts.config,
						common_indexes.START_OF_BETTERAUTH,
						{},
					);
					if (!start_of_betterauth) {
						throw new Error("Couldn't find start of betterAuth() function.");
					}
					opts.config = insertContent({
						line: start_of_betterauth.line - 1,
						character: 0,
						content: opts.config,
						insert_content: `\n${code_before_betterAuth}\n`,
					});
				}

				const code_gen = await config_generation.add_import({
					config: opts.config,
					imports: imports,
				});
				opts.config = code_gen.code;
				database_code_str = db_code;
				required_envs.push(...envs, ...code_gen.envs);
				required_deps.push(...dependencies, ...code_gen.dependencies);
			}

			if (opts.database === "sqlite") {
				await add_db({
					db_code: `new Database(process.env.DATABASE_URL || "database.sqlite")`,
					dependencies: ["better-sqlite3"],
					envs: ["DATABASE_URL"],
					imports: [
						{
							path: "better-sqlite3",
							variables: {
								asType: false,
								name: "Database",
							},
						},
					],
				});
			} else if (opts.database === "postgres") {
				await add_db({
					db_code: `new Pool({\nconnectionString: process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/database"\n})`,
					dependencies: ["pg"],
					envs: ["DATABASE_URL"],
					imports: [
						{
							path: "pg",
							variables: [
								{
									asType: false,
									name: "Pool",
								},
							],
						},
					],
				});
			} else if (opts.database === "mysql") {
				await add_db({
					db_code: `createPool(process.env.DATABASE_URL!)`,
					dependencies: ["mysql2"],
					envs: ["DATABASE_URL"],
					imports: [
						{
							path: "mysql2/promise",
							variables: [
								{
									asType: false,
									name: "createPool",
								},
							],
						},
					],
				});
			} else if (opts.database === "mssql") {
				const dialectCode = `new MssqlDialect({
						tarn: {
							...Tarn,
							options: {
							min: 0,
							max: 10,
							},
						},
						tedious: {
							...Tedious,
							connectionFactory: () => new Tedious.Connection({
							authentication: {
								options: {
								password: 'password',
								userName: 'username',
								},
								type: 'default',
							},
							options: {
								database: 'some_db',
								port: 1433,
								trustServerCertificate: true,
							},
							server: 'localhost',
							}),
						},
					})`;
				await add_db({
					code_before_betterAuth: dialectCode,
					db_code: `dialect`,
					dependencies: ["tedious", "tarn", "kysely"],
					envs: ["DATABASE_URL"],
					imports: [
						{
							path: "tedious",
							variables: {
								name: "*",
								as: "Tedious",
							},
						},
						{
							path: "tarn",
							variables: {
								name: "*",
								as: "Tarn",
							},
						},
						{
							path: "kysely",
							variables: [
								{
									name: "MssqlDialect",
								},
							],
						},
					],
				});
			} else if (
				opts.database === "drizzle:mysql" ||
				opts.database === "drizzle:sqlite" ||
				opts.database === "drizzle:pg"
			) {
				await add_db({
					db_code: `drizzleAdapter(db, {\nprovider: "${opts.database.replace(
						"drizzle:",
						"",
					)}",\n})`,
					dependencies: [""],
					envs: [],
					imports: [
						{
							path: "better-auth/adapters/drizzle",
							variables: [
								{
									name: "drizzleAdapter",
								},
							],
						},
						{
							path: "./database.ts",
							variables: [
								{
									name: "db",
								},
							],
						},
					],
				});
			} else if (
				opts.database === "prisma:mysql" ||
				opts.database === "prisma:sqlite" ||
				opts.database === "prisma:postgresql"
			) {
				await add_db({
					db_code: `prismaAdapter(client, {\nprovider: "${opts.database.replace(
						"prisma:",
						"",
					)}",\n})`,
					dependencies: [`@prisma/client`],
					envs: [],
					code_before_betterAuth: "const client = new PrismaClient();",
					imports: [
						{
							path: "better-auth/adapters/prisma",
							variables: [
								{
									name: "prismaAdapter",
								},
							],
						},
						{
							path: "@prisma/client",
							variables: [
								{
									name: "PrismaClient",
								},
							],
						},
					],
				});
			} else if (opts.database === "mongodb") {
				await add_db({
					db_code: `mongodbAdapter(db)`,
					dependencies: ["mongodb"],
					envs: [`DATABASE_URL`],
					code_before_betterAuth: [
						`const client = new MongoClient(process.env.DATABASE_URL || "mongodb://localhost:27017/database");`,
						`const db = client.db();`,
					].join("\n"),
					imports: [
						{
							path: "better-auth/adapters/mongodb",
							variables: [
								{
									name: "mongodbAdapter",
								},
							],
						},
						{
							path: "mongodb",
							variables: [
								{
									name: "MongoClient",
								},
							],
						},
					],
				});
			}

			let start_of_betterauth = getGroupInfo(
				opts.config,
				common_indexes.START_OF_BETTERAUTH,
				{},
			);
			if (!start_of_betterauth) {
				throw new Error("Couldn't find start of betterAuth() function.");
			}
			let new_content: string;
			new_content = insertContent({
				line: start_of_betterauth.line,
				character: start_of_betterauth.character,
				content: opts.config,
				insert_content: `database: ${database_code_str},`,
			});

			try {
				new_content = await format(new_content);
				return {
					code: new_content,
					dependencies: required_deps,
					envs: required_envs,
				};
			} catch (error) {
				console.error(error);
				throw new Error(
					`Failed to generate new auth config during database addition phase.`,
				);
			}
		},
	};

	let new_user_config: string = await format(current_user_config);
	let total_dependencies: string[] = [];
	let total_envs: string[] = [];

	if (plugins.length !== 0) {
		const imports: {
			path: string;
			variables: {
				asType: boolean;
				name: string;
			}[];
		}[] = [];
		for await (const plugin of plugins) {
			const existingIndex = imports.findIndex((x) => x.path === plugin.path);
			if (existingIndex !== -1) {
				imports[existingIndex]!.variables.push({
					name: plugin.name,
					asType: false,
				});
			} else {
				imports.push({
					path: plugin.path,
					variables: [
						{
							name: plugin.name,
							asType: false,
						},
					],
				});
			}
		}
		if (imports.length !== 0) {
			const { code, envs, dependencies } = await config_generation.add_import({
				config: new_user_config,
				imports: imports,
			});
			total_dependencies.push(...dependencies);
			total_envs.push(...envs);
			new_user_config = code;
		}
	}

	for await (const plugin of plugins) {
		try {
			// console.log(`--------- UPDATE: ${plugin} ---------`);
			let pluginContents = "";
			if (plugin.id === "magic-link") {
				pluginContents = `{\nsendMagicLink({ email, token, url }, request) {\n// Send email with magic link\n},\n}`;
			} else if (plugin.id === "email-otp") {
				pluginContents = `{\nasync sendVerificationOTP({ email, otp, type }, request) {\n// Send email with OTP\n},\n}`;
			} else if (plugin.id === "generic-oauth") {
				pluginContents = `{\nconfig: [],\n}`;
			} else if (plugin.id === "oidc") {
				pluginContents = `{\nloginPage: "/sign-in",\n}`;
			}
			const { code, dependencies, envs } = await config_generation.add_plugin({
				config: new_user_config,
				direction_in_plugins_array:
					plugin.id === "next-cookies" ? "append" : "prepend",
				pluginFunctionName: plugin.name,
				pluginContents: pluginContents,
			});
			new_user_config = code;
			total_envs.push(...envs);
			total_dependencies.push(...dependencies);
			// console.log(new_user_config);
			// console.log(`--------- UPDATE END ---------`);
		} catch (error: any) {
			spinner.stop(
				`Something went wrong while generating/updating your new auth config file.`,
				1,
			);
			console.error(error.message);
			process.exit(1);
		}
	}

	if (database) {
		try {
			const { code, dependencies, envs } = await config_generation.add_database(
				{
					config: new_user_config,
					database: database,
				},
			);
			new_user_config = code;
			total_dependencies.push(...dependencies);
			total_envs.push(...envs);
		} catch (error: any) {
			spinner.stop(
				`Something went wrong while generating/updating your new auth config file.`,
				1,
			);
			console.error(error.message);
			process.exit(1);
		}
	}

	return {
		generatedCode: new_user_config,
		dependencies: total_dependencies,
		envs: total_envs,
	};
}

function findClosingBracket(
	content: string,
	startIndex: number,
	openingBracket: string,
	closingBracket: string,
): number | null {
	let stack = 0;
	let inString = false; // To track if we are inside a string
	let quoteChar: string | null = null; // To track the type of quote

	for (let i = startIndex; i < content.length; i++) {
		const char = content[i];

		// Check if we are entering or exiting a string
		if (char === '"' || char === "'" || char === "`") {
			if (!inString) {
				inString = true;
				quoteChar = char; // Set the quote character
			} else if (char === quoteChar) {
				inString = false; // Exiting the string
				quoteChar = null; // Reset the quote character
			}
			continue; // Skip processing for characters inside strings
		}

		// If we are not inside a string, check for brackets
		if (!inString) {
			if (char === openingBracket) {
				// console.log(`Found opening bracket:`, stack);
				stack++;
			} else if (char === closingBracket) {
				// console.log(`Found closing bracket:`, stack, closingBracket, i);
				if (stack === 0) {
					return i; // Found the matching closing bracket
				}
				stack--;
			}
		}
	}

	return null; // No matching closing bracket found
}

/**
 * Helper function to insert content at a specific line and character position in a string.
 */
function insertContent(params: {
	line: number;
	character: number;
	content: string;
	insert_content: string;
}): string {
	const { line, character, content, insert_content } = params;

	// Split the content into lines
	const lines = content.split("\n");

	// Check if the specified line number is valid
	if (line < 1 || line > lines.length) {
		throw new Error("Invalid line number");
	}

	// Adjust for zero-based index
	const targetLineIndex = line - 1;

	// Check if the specified character index is valid
	if (character < 0 || character > lines[targetLineIndex]!.length) {
		throw new Error("Invalid character index");
	}

	// Insert the new content at the specified position
	const targetLine = lines[targetLineIndex]!;
	const updatedLine =
		targetLine.slice(0, character) +
		insert_content +
		targetLine.slice(character);
	lines[targetLineIndex] = updatedLine;

	// Join the lines back into a single string
	return lines.join("\n");
}

/**
 * Helper function to get the line and character position of a specific group in a string using a CommonIndexConfig.
 */
function getGroupInfo<AdditionalFields>(
	content: string,
	commonIndexConfig: CommonIndexConfig<AdditionalFields>,
	additionalFields: AdditionalFields,
): {
	line: number;
	character: number;
	index: number;
} | null {
	if (commonIndexConfig.type === "regex") {
		const { regex, getIndex } = commonIndexConfig;
		const match = regex.exec(content);
		if (match) {
			const matchIndex = match.index;
			const groupIndex = getIndex({ matchIndex, match, additionalFields });
			if (groupIndex === null) return null;
			const position = getPosition(content, groupIndex);
			return {
				line: position.line,
				character: position.character,
				index: groupIndex,
			};
		}

		return null; // Return null if no match is found
	} else {
		const { getIndex } = commonIndexConfig;
		const index = getIndex({ content, additionalFields });
		if (index === null) return null;

		const { line, character } = getPosition(content, index);
		return {
			line: line,
			character: character,
			index,
		};
	}
}

/**
 * Helper function to calculate line and character position based on an index
 */
const getPosition = (str: string, index: number) => {
	const lines = str.slice(0, index).split("\n");
	return {
		line: lines.length,
		character: lines[lines.length - 1]!.length,
	};
};
