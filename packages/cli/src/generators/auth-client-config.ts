import { type SupportedPlugin } from "../commands/init";
import { type spinner as clackSpinner } from "@clack/prompts";
import type { CommonIndexConfig, Import } from "./auth-config";

type Format = (code: string) => Promise<string>;

export async function generateClientAuthConfig({
	format,
	current_user_config,
	spinner,
	plugins,
}: {
	format: Format;
	current_user_config: string;
	spinner: ReturnType<typeof clackSpinner>;
	plugins: SupportedPlugin[];
}): Promise<{
	generatedCode: string;
	dependencies: string[];
	envs: string[];
}> {
	let _start_of_plugins_common_index = {
		START_OF_PLUGINS: {
			type: "regex",
			regex: /createAuthClient\([\w\W]*plugins:[\W]*\[()/m,
			getIndex: ({ matchIndex, match }) => {
				return matchIndex + match[0].length;
			},
		} satisfies CommonIndexConfig<{}>,
	};
	const common_indexs = {
		START_OF_PLUGINS:
			_start_of_plugins_common_index.START_OF_PLUGINS satisfies CommonIndexConfig<{}>,
		END_OF_PLUGINS: {
			type: "manual",
			getIndex: ({ content, additionalFields }) => {
				const clsoingBracketIndex = findClosingBracket(
					content,
					additionalFields.start_of_plugins,
					"[",
					"]",
				);
				return clsoingBracketIndex;
			},
		} satisfies CommonIndexConfig<{ start_of_plugins: number }>,
		START_OF_BETTERAUTH: {
			type: "regex",
			regex: /createAuthClient\({()/m,
			getIndex: ({ matchIndex }) => {
				return matchIndex + "createAuthClient({".length;
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
				common_indexs.START_OF_PLUGINS,
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
				common_indexs.END_OF_PLUGINS,
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
				let has_found_comma = false;
				const str = opts.config
					.slice(start_of_plugins.index, end_of_plugins.index)
					.split("")
					.reverse();
				for (let index = 0; index < str.length; index++) {
					const char = str[index];
					if (char === ",") {
						has_found_comma = true;
					}
					if (char === ")") {
						break;
					}
				}

				new_content = insertContent({
					line: end_of_plugins.line,
					character: end_of_plugins.character,
					content: opts.config,
					insert_content: `${!has_found_comma ? "," : ""}${
						opts.pluginFunctionName
					}(${opts.pluginContents})`,
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
			return { code: await new_content, dependencies: [], envs: [] };
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
			if (plugin.clientName === undefined) continue;
			const existingIndex = imports.findIndex(
				(x) => x.path === plugin.clientPath,
			);
			if (existingIndex !== -1) {
				imports[existingIndex].variables.push({
					name: plugin.name,
					asType: false,
				});
			} else {
				imports.push({
					path: plugin.clientPath,
					variables: [
						{
							name: plugin.clientName,
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
		if (!plugin.clientName) continue;

		let pluginContents: string = "";
		const { code, dependencies, envs } = await config_generation.add_plugin({
			config: new_user_config,
			direction_in_plugins_array: "append",
			pluginContents: pluginContents,
			pluginFunctionName: plugin.clientName,
		});
		new_user_config = code;
		total_dependencies.push(...dependencies), total_envs.push(...envs);
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
	if (character < 0 || character > lines[targetLineIndex].length) {
		throw new Error("Invalid character index");
	}

	// Insert the new content at the specified position
	const targetLine = lines[targetLineIndex];
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
		character: lines[lines.length - 1].length,
	};
};
