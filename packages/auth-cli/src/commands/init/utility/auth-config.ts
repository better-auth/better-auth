import type { DatabasesConfig } from "../configs/databases.config";
import type { PluginConfig } from "../configs/plugins-index.config";
import { SOCIAL_PROVIDER_CONFIGS } from "../configs/social-providers.config";
import type { GetArgumentsFn } from "../generate-auth";
import { getAuthPluginsCode } from "./plugin";

type GenerateAuthConfigStringOptions = {
	database?: DatabasesConfig | null;
	plugins?: PluginConfig[];
	appName?: string;
	baseURL?: string;
	emailAndPassword?: boolean;
	socialProviders?: string[];
	getArguments: GetArgumentsFn;
};

export const generateInnerAuthConfigCode = async ({
	database,
	plugins,
	appName,
	baseURL,
	emailAndPassword,
	socialProviders,
	getArguments,
}: GenerateAuthConfigStringOptions) => {
	let code: Record<string, string | undefined> = {
		database: getDatabaseCode(database),
		appName: getAppNameCode(appName),
		baseURL: getBaseURLCode(baseURL),
		emailAndPassword: getEmailAndPasswordCode(emailAndPassword),
		socialProviders: getSocialProvidersCode(socialProviders),
		plugins: await getAuthPluginsCode({ plugins, getArguments }),
	};

	let stringCode = "";
	for (const key in code) {
		if (!code[key]) continue;
		stringCode += `${key}: ${code[key]},\n`;
	}
	return stringCode;
};

const getEmailAndPasswordCode = (enabled?: boolean) => {
	if (!enabled) return undefined;
	return `{ enabled: true }`;
};

const getSocialProvidersCode = (providers?: string[]) => {
	if (!providers || providers.length === 0) return undefined;
	const providersConfig = providers
		.map((provider) => {
			const config =
				SOCIAL_PROVIDER_CONFIGS[
					provider as keyof typeof SOCIAL_PROVIDER_CONFIGS
				];
			if (!config) {
				// Fallback for unknown providers
				const providerUpper = provider.toUpperCase();
				return `		${provider}: {
			clientId: process.env.${providerUpper}_CLIENT_ID!,
			clientSecret: process.env.${providerUpper}_CLIENT_SECRET!,
		}`;
			}

			// Generate config based on provider-specific options
			const options = config.options
				.map((opt) => {
					return `			${opt.name}: process.env.${opt.envVar}!,`;
				})
				.join("\n");

			return `		${provider}: {\n${options}\n		}`;
		})
		.join(",\n");
	return `{\n${providersConfig}\n	}`;
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

const getDatabaseCode = (database?: DatabasesConfig | null) => {
	if (!database) return undefined;
	return database.code({});
};
