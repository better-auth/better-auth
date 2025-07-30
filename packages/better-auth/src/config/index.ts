import fs from "node:fs";
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

	public set(key: string, value: string) {
		this.store[key] = value;
		this.writeStore();
	}

	public get(key: string) {
		this.readStore();
		return this.store[key];
	}

	public delete(key: string) {
		this.store[key] = undefined;
		this.writeStore();
	}

	public clear() {
		this.store = {};
		this.writeStore();
	}

	public has(key: string) {
		return this.get(key) !== undefined;
	}

	private writeStore() {
		const contents = JSON.stringify(this.store, null, "\t");
		fs.writeFileSync(this.storePath, contents);
	}

	private readStore() {
		const contents = fs.readFileSync(this.storePath).toString();
		this.store = JSON.parse(contents);
	}
}
