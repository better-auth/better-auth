import fs from "node:fs/promises";
import path from "node:path";

import { loadConfig } from "./load-config";
import { getConfigDir } from "./config-dir";

export interface GlobalConfigOptions {
	name?: string;
}

type RealizedGlobalConfigOptions = Required<GlobalConfigOptions>;

export function createGlobalConfig(options?: GlobalConfigOptions) {
	const opts: RealizedGlobalConfigOptions = {
		name: options?.name ?? "better-auth",
	};

	const configDir = getConfigDir(opts.name);
	const storePath = path.join(configDir, "config.json");

	let store = loadConfig(storePath);

	const writeStore = async () => {
		const contents = JSON.stringify(store, null, "\t");
		await fs.writeFile(storePath, contents);
	};

	const readStore = async () => {
		try {
			const contents = await fs.readFile(storePath, "utf8");
			store = JSON.parse(contents);
		} catch (err: any) {
			if (err.code === "ENOENT") {
				store = {};
			} else {
				const contents = await fs.readFile(storePath, "utf8");
				throw { contents, err };
			}
		}
	};

	const crud = {
		set: async (key: string, value: string) => {
			store[key] = value;
			await writeStore();
		},
		get: async (key: string) => {
			await readStore();
			return store[key];
		},
		delete: async (key: string) => {
			store[key] = undefined;
			await writeStore();
		},
		clear: async () => {
			store = {};
			await writeStore();
		},
	};

	return Object.freeze({
		...crud,

		has: async (key: string) => {
			const value = await crud.get(key);
			return value !== undefined;
		},

		getWithFallback: async (key: string, getValue: () => string) => {
			const currentValue = await crud.get(key);
			if (currentValue !== undefined) {
				return currentValue;
			}
			const newValue = getValue();
			crud.set(key, newValue);
			return newValue;
		},
	});
}

export type GlobalConfig = ReturnType<typeof createGlobalConfig>;
