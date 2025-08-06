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

/**
 * Get environment variable with fallback
 */
export function getEnvVar(key: string, fallback?: string): string | undefined {
	if (typeof process !== "undefined" && process.env) {
		return process.env[key] ?? fallback;
	}

	// @ts-expect-error deno
	if (typeof Deno !== "undefined") {
		// @ts-expect-error deno
		return Deno.env.get(key) || fallback;
	}

	// Handle Bun
	if (typeof Bun !== "undefined") {
		return Bun.env[key] || fallback;
	}

	return fallback;
}

/**
 * Get boolean environment variable
 */
export function getBooleanEnvVar(key: string, fallback = true): boolean {
	const value = getEnvVar(key);
	if (value === undefined) return fallback;
	return value !== "0" && value.toLowerCase() !== "false" && value !== "";
}

/**
 * Common environment variables used in Better Auth
 */
export const ENV = {
	get BETTER_AUTH_SECRET() {
		return getEnvVar("BETTER_AUTH_SECRET");
	},
	get AUTH_SECRET() {
		return getEnvVar("AUTH_SECRET");
	},
	get BETTER_AUTH_TELEMETRY() {
		return getEnvVar("BETTER_AUTH_TELEMETRY");
	},
	get BETTER_AUTH_TELEMETRY_ID() {
		return getEnvVar("BETTER_AUTH_TELEMETRY_ID");
	},
	get NODE_ENV() {
		return getEnvVar("NODE_ENV", "development");
	},
	get PACKAGE_VERSION() {
		return getEnvVar("PACKAGE_VERSION", "0.0.0");
	},
} as const;
