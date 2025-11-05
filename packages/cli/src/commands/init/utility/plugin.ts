import {
	type Plugin,
	type PluginConfig,
	pluginsConfig,
} from "../configs/plugins.config";
import type { GetArgumentsFn } from "../generate-auth";
import { formatCode } from "./format";

export const getPluginConfigs = (plugins: Plugin[]) => {
	return plugins.map((plugin) => {
		const pluginConfig = pluginsConfig[plugin];
		if (!pluginConfig) {
			throw new Error(`Plugin ${plugin} not found`);
		}
		return pluginConfig;
	});
};

export const getAuthPluginsCode = async ({
	getArguments,
	plugins,
}: {
	plugins?: PluginConfig[];
	getArguments: GetArgumentsFn;
}) => {
	if (!plugins || plugins.length === 0) return;
	let pluginsCode: string[] = [];
	for (const plugin of plugins) {
		let argumentsCode: Map<number, any> = new Map();
		if (plugin.auth.arguments) {
			for (const argument of plugin.auth.arguments) {
				const result = await getArguments(argument);
				const schema = argument.argument.schema.safeParse(result);
				if (!schema.success) {
					throw new Error(
						`Invalid argument for ${plugin.auth.function}: ${schema.error.message}`,
					);
				}
				const value = schema.data;
				const index = argument.argument.index;
				if (argument.argument.isProperty) {
					if (argumentsCode.has(index)) {
						const previous = argumentsCode.get(index) || {};
						if (typeof previous !== "object") {
							throw new Error(`Argument at index ${index} is not an object`);
						}
						argumentsCode.set(index, {
							...previous,
							[argument.argument.isProperty]: value,
						});
					} else {
						argumentsCode.set(index, {
							[argument.argument.isProperty]: value,
						});
					}
				} else {
					argumentsCode.set(index, value);
				}
			}
		}

		// convert argumentsCode to an array of values
		let args: string[] = Array.from(argumentsCode.values()).map((value) => {
			if (typeof value === "object" && value !== null) {
				value = Object.fromEntries(
					Object.entries(value).filter(([_, v]) => typeof v !== "undefined"),
				);
				if (Object.keys(value).length === 0) return "undefined";
				if (typeof value === "undefined") return "undefined";
				return JSON.stringify(value);
			}
			if (typeof value === "undefined") return "undefined";
			return JSON.stringify(value);
		});

		// Remove trailing undefined values
		for (let i = args.length - 1; i >= 0; i--) {
			if (args[i] !== "undefined") break;
			args.pop();
		}

		pluginsCode.push(`${plugin.auth.function}(${args.join(", ")})`);
	}
	return (await formatCode(`[${pluginsCode.join(", ")}]`)).trim().slice(0, -1);
};
