import { databaseCodeSnippets, type SupportedDatabase } from "../supported-dbs";
import { sortPlugins, type SupportedPlugin } from "../supported-plugins";
import type { SupportedSocialProvider } from "../supported-social-providers";
import type { Format } from "../types";
import { groupImportStatements } from "../utils/group-import-statements";
import { generatePluginsArray } from "./generate-plugins-array";
import { generateSocialProviders } from "./generate-social-providers";
import { generateImportStatements } from "./import-statements";

const LINE_REMOVE_KEY = "//__REMOVE__";

export const generateAuth = async ({
	appName,
	format,
	plugins,
	database,
	emailAndPasswordAuthentication,
	socialProviders,
}: {
	appName?: string | null;
	format: Format;
	plugins: SupportedPlugin[];
	database: SupportedDatabase | null;
	emailAndPasswordAuthentication: boolean;
	socialProviders: SupportedSocialProvider[];
}) => {
	const db_details = database ? databaseCodeSnippets[database] : null;

	// Sort the plugins.
	// Eg, next cookies must be at the end of the array.
	plugins = plugins.sort(sortPlugins);

	// All the import statements
	const pluginImports = plugins.map((x) => x.imports).flat();
	const dbImports = db_details?.imports || [];

	// Group all import statements together
	const imports = groupImportStatements({
		initialImports: [
			{
				path: "better-auth",
				variables: [{ name: "betterAuth" }],
			},
		],
		additionalImports: [...dbImports, ...pluginImports],
	});

	// generate code for import statements
	let importString = generateImportStatements({ imports });

	const pluginsArrayCode = await generatePluginsArray({
		plugins: plugins || [],
		existingPluginsArrayCode: `[]`, // since this is the first time we're generating the code, we don't have any existing plugins array code.
		format: format,
		isClient: false,
	});

	let database_precode = "";
	if (database) {
		database_precode = databaseCodeSnippets[database].pre_code || "";
		database_precode += `\n`;
	}

	let socialProvidersCode = generateSocialProviders(socialProviders);
	if (socialProvidersCode.trim() === "") socialProvidersCode = LINE_REMOVE_KEY;

	return await format(
		[
			importString,
			``,
			database_precode,
			"export const auth = betterAuth({",
			appName ? `appName: "${appName}",` : "",
			emailAndPasswordAuthentication ? `emailAndPassword: {` : "",
			emailAndPasswordAuthentication ? `enabled: true,` : "",
			emailAndPasswordAuthentication ? `},` : "",
			socialProvidersCode,
			database ? `database: ${databaseCodeSnippets[database].snippet},` : "",
			pluginsArrayCode.trim() === "[]"
				? LINE_REMOVE_KEY
				: `plugins: ${pluginsArrayCode},`,
			"});",
		]
			.filter((x) => x.trim() !== LINE_REMOVE_KEY)
			.join("\n"),
	);
};
