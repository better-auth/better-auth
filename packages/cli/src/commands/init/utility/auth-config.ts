import type { Awaitable } from "@better-auth/core";
import type { DatabasesConfig } from "../configs/databases.config";
import { SOCIAL_PROVIDER_CONFIGS } from "../configs/social-providers.config";
import type { PluginConfig } from "../configs/temp-plugins.config";
import { getAuthPluginsCode } from "./plugin";

type GenerateAuthConfigStringOptions = {
	database?: DatabasesConfig | null;
	plugins?: PluginConfig[];
	appName?: string;
	baseURL?: string;
	emailAndPassword?: boolean;
	socialProviders?: string[];
	options?: Record<string, unknown>;
	installDependency: (
		dependencies: string | string[],
		type?: "dev" | "prod",
	) => Awaitable<unknown>;
};

export const generateInnerAuthConfigCode = async ({
	database,
	plugins,
	appName,
	baseURL,
	emailAndPassword,
	socialProviders,
	options,
	installDependency,
}: GenerateAuthConfigStringOptions) => {
	const code: Record<string, string | undefined> = {
		database: getDatabaseCode(database),
		appName: getAppNameCode(appName),
		baseURL: getBaseURLCode(baseURL),
		emailAndPassword: getEmailAndPasswordCode(emailAndPassword),
		socialProviders: getSocialProvidersCode(socialProviders),
		plugins: await getAuthPluginsCode({ plugins, options, installDependency }),
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
	} catch {
		throw new Error("baseURL must be a valid URL");
	}

	return JSON.stringify(url.toString());
};

const getDatabaseCode = (database?: DatabasesConfig | null) => {
	if (!database) return undefined;
	return database.code({});
};
