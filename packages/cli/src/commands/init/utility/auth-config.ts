import type { DatabasesConfig } from "../configs/databases.config";
import type { PluginsConfig } from "../configs/plugins.config";

type GenerateAuthConfigStringOptions = {
	database: DatabasesConfig;
	plugins?: PluginsConfig;
	appName?: string;
	baseURL?: string;
};

export const generateInnerAuthConfigCode = ({
	database,
	plugins,
	appName,
	baseURL,
}: GenerateAuthConfigStringOptions) => {
	let code: Record<string, string> = {};

	if (database) {
		code.database = database.code({});
	}

	let stringCode = "";

	for (const key in code) {
		stringCode += `${key}: ${code[key]},\n`;
	}

	return stringCode;
};
