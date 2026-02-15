import type { Awaitable } from "@better-auth/core";
import type { DatabasesConfig } from "../configs/databases.config";
import type { PluginConfig } from "../configs/temp-plugins.config";
import { getAuthClientPluginsCode } from "./plugin";

type GenerateAuthClientConfigStringOptions = {
	database?: DatabasesConfig | null;
	plugins?: PluginConfig[];
	appName?: string;
	baseURL?: string;
	options?: Record<string, unknown>;
	installDependency: (
		dependencies: string | string[],
		type?: "dev" | "prod",
	) => Awaitable<unknown>;
};

export const generateInnerAuthClientConfigCode = async ({
	plugins,
	options,
	installDependency,
}: GenerateAuthClientConfigStringOptions) => {
	const code: Record<string, string | undefined> = {
		plugins: await getAuthClientPluginsCode({
			plugins,
			options,
			installDependency,
		}),
	};

	let stringCode = "";
	for (const key in code) {
		if (!code[key]) continue;
		stringCode += `${key}: ${code[key]},\n`;
	}
	return stringCode;
};
