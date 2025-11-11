import type { DatabasesConfig } from "../configs/databases.config";
import type { PluginConfig } from "../configs/plugins-index.config";
import type { GetArgumentsFn } from "../generate-auth";
import { getAuthPluginsCode } from "./plugin";

type GenerateAuthConfigStringOptions = {
	database: DatabasesConfig;
	plugins?: PluginConfig[];
	appName?: string;
	baseURL?: string;
	getArguments: GetArgumentsFn;
};

export const generateInnerAuthConfigCode = async ({
	database,
	plugins,
	appName,
	baseURL,
	getArguments,
}: GenerateAuthConfigStringOptions) => {
	let code: Record<string, string | undefined> = {
		database: getDatabaseCode(database),
		appName: getAppNameCode(appName),
		baseURL: getBaseURLCode(baseURL),
		plugins: await getAuthPluginsCode({ plugins, getArguments }),
	};

	let stringCode = "";
	for (const key in code) {
		if (!code[key]) continue;
		stringCode += `${key}: ${code[key]},\n`;
	}
	return stringCode;
};

const getAppNameCode = (appName?: string) => {
	if (!appName) return;
	if (typeof appName !== "string") {
		throw new Error("appName must be a string");
	}
	return JSON.stringify(appName);
};

const getBaseURLCode = (baseURL?: string) => {
	if (!baseURL) return;
	if (typeof baseURL !== "string") {
		throw new Error("baseURL must be a string");
	}
	let url: URL;
	try {
		url = new URL(baseURL);
	} catch (error) {
		throw new Error("baseURL must be a valid URL");
	}

	return JSON.stringify(url.toString());
};

const getDatabaseCode = (database: DatabasesConfig) => {
	return database.code({});
};
