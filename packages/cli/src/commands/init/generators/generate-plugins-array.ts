import type { SupportedPlugin } from "../supported-plugins";
import type { Format } from "../types";

/**
 * A string that represents the plugins array code.
 * This includes the array brackets and commas.
 */
export const generatePluginsArray = async ({
	plugins,
	isClient,
	existingPluginsArrayCode,
	format,
}: {
	plugins: SupportedPlugin[];
	isClient: boolean;
	/**
	 * The existing plugins array code.
	 * This includes the array brackets and commas.
	 */
	existingPluginsArrayCode: string;
	format: Format;
}) => {
	// This should never be the case given the input should be somewhat hardcoded to include the brackets.
	// But just in case...
	if (
		!existingPluginsArrayCode.startsWith("[") ||
		!existingPluginsArrayCode.endsWith("]")
	) {
		throw new Error(
			"Invalid existingPluginsArrayCode. Expected to start with '[' and end with ']'.",
		);
	}

	// Note:
	// When you format an array, it will **always** end something like this:
	// [test(), test2()];
	//
	// * If there was a comma at the end of the last element, it will be removed.
	// * No matter the spacing between elements, it will always format out to be spaced equally.

	let sanitizedExistingPluginsArrayCode = await format(
		existingPluginsArrayCode,
	);
	// Remove the semicolon at the end.
	sanitizedExistingPluginsArrayCode = sanitizedExistingPluginsArrayCode.slice(
		0,
		sanitizedExistingPluginsArrayCode.length - 2,
	);

	// Remove first `[` and last `]`
	sanitizedExistingPluginsArrayCode =
		sanitizedExistingPluginsArrayCode.slice(1);
	sanitizedExistingPluginsArrayCode = sanitizedExistingPluginsArrayCode.slice(
		0,
		sanitizedExistingPluginsArrayCode.length - 1,
	);

	// Split the string by commas
	const pluginsArray: string[] = sanitizedExistingPluginsArrayCode
		.split(", ")
		.filter((x) => x.trim() !== "");

	for (const plugin of plugins) {
		if (isClient) {
			if(plugin.clientName){
				pluginsArray.push(`${plugin.clientName}(${plugin.defaultClientContent})`);
			}
		} else {
			pluginsArray.push(`${plugin.name}(${plugin.defaultContent})`);
		}
	}

	const assembled = `[${pluginsArray.join(", ")}]`;
	return assembled;
};
