//https://github.com/unjs/std-env/blob/main/src/env.ts

const _envShim = Object.create(null);

export type EnvObject = Record<string, string | undefined>;

const _getEnv = (useShim?: boolean) =>
	globalThis.process?.env ||
	//@ts-expect-error
	globalThis.Deno?.env.toObject() ||
	//@ts-expect-error
	globalThis.__env__ ||
	(useShim ? _envShim : globalThis);

export const env = new Proxy<EnvObject>(_envShim, {
	get(_, prop) {
		const env = _getEnv();
		return env[prop as any] ?? _envShim[prop];
	},
	has(_, prop) {
		const env = _getEnv();
		return prop in env || prop in _envShim;
	},
	set(_, prop, value) {
		const env = _getEnv(true);
		env[prop as any] = value;
		return true;
	},
	deleteProperty(_, prop) {
		if (!prop) {
			return false;
		}
		const env = _getEnv(true);
		delete env[prop as any];
		return true;
	},
	ownKeys() {
		const env = _getEnv(true);
		return Object.keys(env);
	},
});

function toBoolean(val: boolean | string | undefined) {
	return val ? val !== "false" : false;
}

export const nodeENV =
	(typeof process !== "undefined" && process.env && process.env.NODE_ENV) || "";

/** Detect if `NODE_ENV` environment variable is `production` */
export const isProduction = nodeENV === "production";

/** Detect if `NODE_ENV` environment variable is `dev` or `development` */
export const isDevelopment = nodeENV === "dev" || nodeENV === "development";

/** Detect if `NODE_ENV` environment variable is `test` */
export const isTest = nodeENV === "test" || toBoolean(env.TEST);
