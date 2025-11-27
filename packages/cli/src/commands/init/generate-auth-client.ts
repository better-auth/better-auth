import type { GenerateAuthFileOptions } from "./generate-auth";
import { formatCode } from "./utility";
import { generateInnerAuthClientConfigCode } from "./utility/auth-client-config";
import type { ImportGroup } from "./utility/imports";
import { createImport, getImportString } from "./utility/imports";
import { getPluginConfigs } from "./utility/plugin";

export const generateAuthClientConfigCode = async ({
	plugins: pluginsConfig,
	database: databaseConfig,
	framework,
	getArguments,
}: GenerateAuthFileOptions) => {
	const plugins = getPluginConfigs(pluginsConfig);

	let imports: ImportGroup[] = [
		...(!framework.authClient
			? []
			: ([
					{
						imports: [createImport({ name: "createAuthClient" })],
						path: framework.authClient.importPath as string,
						isNamedImport: false,
					},
				] satisfies ImportGroup[])),
		...Object.values(plugins)
			.map(({ authClient }) => (!authClient ? [] : authClient.imports))
			.flat(),
	];

	const authClientCode = await generateInnerAuthClientConfigCode({
		plugins,
		getArguments,
	});

	const segmentedCode = {
		imports: await getImportString(imports),
		exports: "",
		preAuthConfig: "",
		authConfig: authClientCode ? `{${authClientCode}}` : "",
		postAuthConfig: "",
	};

	const code: string[] = [
		segmentedCode.imports,
		``,
		segmentedCode.preAuthConfig,
		``,
		`export const authClient = createAuthClient(`,
		segmentedCode.authConfig,
		`);`,
		``,
		segmentedCode.postAuthConfig,
		``,
		segmentedCode.exports,
	];
	return await formatCode(code.join("\n"));
};
