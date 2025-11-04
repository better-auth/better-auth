import type { DatabaseAdapter } from "./configs/databases.config";
import type { PluginsConfig } from "./configs/plugins.config";
import {
	formatCode,
	generateInnerAuthConfigCode,
	getDatabaseCode,
} from "./utility";
import {
	createImport,
	getImportString,
	type ImportGroup,
} from "./utility/imports";

export type GenerateAuthFileOptions = {
	plugins: PluginsConfig;
	database: DatabaseAdapter;
};

export const generateAuthConfigCode = async ({
	plugins,
	database: databaseAdapter,
}: GenerateAuthFileOptions) => {
	const database = getDatabaseCode(databaseAdapter);

	let imports: ImportGroup[] = [
		{
			imports: [createImport({ name: "betterAuth" })],
			path: "better-auth",
			isNamedImport: false,
		},
		...Object.values(plugins)
			.map(({ auth }) => auth.imports)
			.flat(),
		...database.imports,
	];

	const segmentedCode = {
		imports: await getImportString(imports),
		exports: "",
		preAuthConfig: database.preCode ?? "",
		authConfig: generateInnerAuthConfigCode({ plugins, database }),
		postAuthConfig: "",
	};

	const code: string[] = [
		segmentedCode.imports,
		``,
		segmentedCode.preAuthConfig,
		``,
		`export const auth = betterAuth({`,
		segmentedCode.authConfig,
		`});`,
		``,
		segmentedCode.postAuthConfig,
		``,
		segmentedCode.exports,
	];
	return await formatCode(code.join("\n"));
};
