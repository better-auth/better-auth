import type { DatabasesConfig } from "../configs/databases.config";
import type { PluginConfig } from "../configs/plugins-index.config";
import type { GetArgumentsFn } from "../generate-auth";
import { getAuthClientPluginsCode } from "./plugin";

type GenerateAuthClientConfigStringOptions = {
	database?: DatabasesConfig | null;
	plugins?: PluginConfig[];
	appName?: string;
	baseURL?: string;
	getArguments: GetArgumentsFn;
};

export const generateInnerAuthClientConfigCode = async ({
	plugins,
	getArguments,
}: GenerateAuthClientConfigStringOptions) => {
	let code: Record<string, string | undefined> = {
		plugins: await getAuthClientPluginsCode({ plugins, getArguments }),
	};

	let stringCode = "";
	for (const key in code) {
		if (!code[key]) continue;
		stringCode += `${key}: ${code[key]},\n`;
	}
	return stringCode;
};
