import fs from "node:fs/promises";
import path from "node:path";

import { loadConfig } from "./load-config";
import { getConfigDir } from "./config-dir";

interface GlobalConfigOptions {
	name?: string;
}
type RealizedGlobalConfigOptions = Required<GlobalConfigOptions>;

export class GlobalConfig {
	private storePath: string;
	private options: RealizedGlobalConfigOptions;
	private store: Record<string, string | undefined>;

	constructor(options?: GlobalConfigOptions) {
		this.options = {
			name: options?.name ?? "better-auth",
		};

		const configDir = getConfigDir(this.options.name);
		this.storePath = path.join(configDir, "config.json");

		this.store = loadConfig(this.storePath);
	}

	public async set(key: string, value: string) {
		this.store[key] = value;
		await this.writeStore();
	}

	public async get(key: string) {
		await this.readStore();
		return this.store[key];
	}

	public async delete(key: string) {
		this.store[key] = undefined;
		await this.writeStore();
	}

	public async clear() {
		this.store = {};
		await this.writeStore();
	}

	public async has(key: string) {
		const value = await this.get(key);
		return value !== undefined;
	}

	private async writeStore() {
		const contents = JSON.stringify(this.store, null, "\t");
		await fs.writeFile(this.storePath, contents);
	}

	private async readStore() {
		try {
			const contents = await fs.readFile(this.storePath, "utf8");
			this.store = JSON.parse(contents);
		} catch (err: any) {
			if (err.code === "ENOENT") {
				this.store = {};
			} else {
				throw err;
			}
		}
	}
}
