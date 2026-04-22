import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BetterAuthOptions } from "@better-auth/core";
import { ENV, getBooleanEnvVar, isTest, logger } from "@better-auth/core/env";
import { betterFetch } from "@better-fetch/fetch";
import type { PackageJson } from "type-fest";
import { getTelemetryAuthConfig } from "./detectors/detect-auth-config.js";
import { detectPackageManager } from "./detectors/detect-project-info.js";
import {
	detectEnvironment,
	detectRuntime,
} from "./detectors/detect-runtime.js";
import type { TelemetryContext, TelemetryEvent } from "./types.js";
import { hashToBase64 } from "./utils/hash.js";
import { generateId } from "./utils/id.js";
export { getTelemetryAuthConfig };
export type { TelemetryEvent } from "./types.js";

// --- Node-specific: package.json reading ---

let packageJSONCache: PackageJson | undefined;

async function readRootPackageJson(): Promise<PackageJson | undefined> {
	if (packageJSONCache) return packageJSONCache;
	try {
		const cwd = process.cwd();
		if (!cwd) return undefined;
		const raw = await fsPromises.readFile(
			path.join(cwd, "package.json"),
			"utf-8",
		);
		packageJSONCache = JSON.parse(raw);
		return packageJSONCache as PackageJson;
	} catch {}
	return undefined;
}

async function getPackageVersion(pkg: string): Promise<string | undefined> {
	if (packageJSONCache) {
		return (packageJSONCache.dependencies?.[pkg] ||
			packageJSONCache.devDependencies?.[pkg] ||
			packageJSONCache.peerDependencies?.[pkg]) as string | undefined;
	}

	try {
		const cwd = process.cwd();
		if (!cwd) throw new Error("no-cwd");
		const pkgJsonPath = path.join(cwd, "node_modules", pkg, "package.json");
		const raw = await fsPromises.readFile(pkgJsonPath, "utf-8");
		const json = JSON.parse(raw);
		const resolved =
			(json.version as string) ||
			(await getVersionFromLocalPackageJson(pkg)) ||
			undefined;
		return resolved;
	} catch {}

	return getVersionFromLocalPackageJson(pkg);
}

async function getVersionFromLocalPackageJson(
	pkg: string,
): Promise<string | undefined> {
	const json = await readRootPackageJson();
	if (!json) return undefined;
	const allDeps = {
		...json.dependencies,
		...json.devDependencies,
		...json.peerDependencies,
	} as Record<string, string | undefined>;
	return allDeps[pkg];
}

async function getNameFromLocalPackageJson(): Promise<string | undefined> {
	const json = await readRootPackageJson();
	return json?.name as string | undefined;
}

// --- Node-specific: system info ---

async function detectSystemInfo() {
	try {
		const cpus = os.cpus();
		return {
			deploymentVendor: getVendor(),
			systemPlatform: os.platform(),
			systemRelease: os.release(),
			systemArchitecture: os.arch(),
			cpuCount: cpus.length,
			cpuModel: cpus.length ? cpus[0]!.model : null,
			cpuSpeed: cpus.length ? cpus[0]!.speed : null,
			memory: os.totalmem(),
			isWSL: await isWsl(),
			isDocker: await isDocker(),
			isTTY: (process as any).stdout ? (process as any).stdout.isTTY : null,
		};
	} catch {
		return {
			systemPlatform: null,
			systemRelease: null,
			systemArchitecture: null,
			cpuCount: null,
			cpuModel: null,
			cpuSpeed: null,
			memory: null,
			isWSL: null,
			isDocker: null,
			isTTY: null,
		};
	}
}

function getVendor() {
	const env = process.env as Record<string, string | undefined>;
	const hasAny = (...keys: string[]) => keys.some((k) => Boolean(env[k]));

	if (
		hasAny("CF_PAGES", "CF_PAGES_URL", "CF_ACCOUNT_ID") ||
		(typeof navigator !== "undefined" &&
			navigator.userAgent === "Cloudflare-Workers")
	) {
		return "cloudflare";
	}

	if (hasAny("VERCEL", "VERCEL_URL", "VERCEL_ENV")) return "vercel";
	if (hasAny("NETLIFY", "NETLIFY_URL")) return "netlify";
	if (
		hasAny(
			"RENDER",
			"RENDER_URL",
			"RENDER_INTERNAL_HOSTNAME",
			"RENDER_SERVICE_ID",
		)
	)
		return "render";
	if (
		hasAny("AWS_LAMBDA_FUNCTION_NAME", "AWS_EXECUTION_ENV", "LAMBDA_TASK_ROOT")
	)
		return "aws";
	if (
		hasAny(
			"GOOGLE_CLOUD_FUNCTION_NAME",
			"GOOGLE_CLOUD_PROJECT",
			"GCP_PROJECT",
			"K_SERVICE",
		)
	)
		return "gcp";
	if (
		hasAny(
			"AZURE_FUNCTION_NAME",
			"FUNCTIONS_WORKER_RUNTIME",
			"WEBSITE_INSTANCE_ID",
			"WEBSITE_SITE_NAME",
		)
	)
		return "azure";
	if (hasAny("DENO_DEPLOYMENT_ID", "DENO_REGION")) return "deno-deploy";
	if (hasAny("FLY_APP_NAME", "FLY_REGION", "FLY_ALLOC_ID")) return "fly-io";
	if (hasAny("RAILWAY_STATIC_URL", "RAILWAY_ENVIRONMENT_NAME"))
		return "railway";
	if (hasAny("DYNO", "HEROKU_APP_NAME")) return "heroku";
	if (hasAny("DO_DEPLOYMENT_ID", "DO_APP_NAME", "DIGITALOCEAN"))
		return "digitalocean";
	if (hasAny("KOYEB", "KOYEB_DEPLOYMENT_ID", "KOYEB_APP_NAME")) return "koyeb";
	return null;
}

let isDockerCached: boolean | undefined;

async function hasDockerEnv() {
	try {
		fs.statSync("/.dockerenv");
		return true;
	} catch {
		return false;
	}
}

async function hasDockerCGroup() {
	try {
		return fs.readFileSync("/proc/self/cgroup", "utf8").includes("docker");
	} catch {
		return false;
	}
}

async function isDocker() {
	if (isDockerCached === undefined) {
		isDockerCached = (await hasDockerEnv()) || (await hasDockerCGroup());
	}
	return isDockerCached;
}

let isInsideContainerCached: boolean | undefined;

const hasContainerEnv = async () => {
	try {
		fs.statSync("/run/.containerenv");
		return true;
	} catch {
		return false;
	}
};

async function isInsideContainer() {
	if (isInsideContainerCached === undefined) {
		isInsideContainerCached = (await hasContainerEnv()) || (await isDocker());
	}
	return isInsideContainerCached;
}

async function isWsl() {
	try {
		if (process.platform !== "linux") {
			return false;
		}
		if (os.release().toLowerCase().includes("microsoft")) {
			if (await isInsideContainer()) {
				return false;
			}
			return true;
		}

		return fs
			.readFileSync("/proc/version", "utf8")
			.toLowerCase()
			.includes("microsoft")
			? !(await isInsideContainer())
			: false;
	} catch {
		return false;
	}
}

// --- Node-specific: project ID ---

let projectIdCached: string | null = null;

async function getProjectId(baseUrl: string | undefined): Promise<string> {
	if (projectIdCached) return projectIdCached;

	const projectName = await getNameFromLocalPackageJson();
	if (projectName) {
		projectIdCached = await hashToBase64(
			baseUrl ? baseUrl + projectName : projectName,
		);
		return projectIdCached;
	}

	if (baseUrl) {
		projectIdCached = await hashToBase64(baseUrl);
		return projectIdCached;
	}

	projectIdCached = generateId(32);
	return projectIdCached;
}

// --- detectDatabase/detectFramework override using local package.json reading ---

async function detectDatabaseNode() {
	const DATABASES: Record<string, string> = {
		pg: "postgresql",
		mysql: "mysql",
		mariadb: "mariadb",
		sqlite3: "sqlite",
		"better-sqlite3": "sqlite",
		"@prisma/client": "prisma",
		mongoose: "mongodb",
		mongodb: "mongodb",
		"drizzle-orm": "drizzle",
	};
	for (const [pkg, name] of Object.entries(DATABASES)) {
		const version = await getPackageVersion(pkg);
		if (version) return { name, version };
	}
	return undefined;
}

async function detectFrameworkNode() {
	const FRAMEWORKS: Record<string, string> = {
		next: "next",
		nuxt: "nuxt",
		"react-router": "react-router",
		astro: "astro",
		"@sveltejs/kit": "sveltekit",
		"solid-start": "solid-start",
		"tanstack-start": "tanstack-start",
		hono: "hono",
		express: "express",
		elysia: "elysia",
		expo: "expo",
	};
	for (const [pkg, name] of Object.entries(FRAMEWORKS)) {
		const version = await getPackageVersion(pkg);
		if (version) return { name, version };
	}
	return undefined;
}

// --- Main telemetry export (node version) ---

const noop: (event: TelemetryEvent) => Promise<void> = async function noop() {};

export async function createTelemetry(
	options: BetterAuthOptions,
	context?: TelemetryContext | undefined,
) {
	const debugEnabled =
		options.telemetry?.debug ||
		getBooleanEnvVar("BETTER_AUTH_TELEMETRY_DEBUG", false);

	const telemetryEndpoint = ENV.BETTER_AUTH_TELEMETRY_ENDPOINT;
	if (!telemetryEndpoint && !context?.customTrack) {
		return {
			publish: noop,
		};
	}
	const track = async (event: TelemetryEvent) => {
		if (context?.customTrack) {
			await context.customTrack(event).catch(logger.error);
		} else if (telemetryEndpoint) {
			if (debugEnabled) {
				logger.info("telemetry event", JSON.stringify(event, null, 2));
			} else {
				await betterFetch(telemetryEndpoint, {
					method: "POST",
					body: event,
				}).catch(logger.error);
			}
		}
	};

	const isEnabled = async () => {
		const telemetryEnabled =
			options.telemetry?.enabled !== undefined
				? options.telemetry.enabled
				: false;
		const envEnabled = getBooleanEnvVar("BETTER_AUTH_TELEMETRY", false);
		return (
			(envEnabled || telemetryEnabled) && (context?.skipTestCheck || !isTest())
		);
	};

	const enabled = await isEnabled();
	let anonymousId: string | undefined;

	if (enabled) {
		anonymousId = await getProjectId(
			typeof options.baseURL === "string" ? options.baseURL : undefined,
		);

		const payload = {
			config: await getTelemetryAuthConfig(options, context),
			runtime: detectRuntime(),
			database: await detectDatabaseNode(),
			framework: await detectFrameworkNode(),
			environment: detectEnvironment(),
			systemInfo: await detectSystemInfo(),
			packageManager: detectPackageManager(),
		};

		void track({ type: "init", payload, anonymousId });
	}

	return {
		publish: async (event: TelemetryEvent) => {
			if (!enabled) return;
			if (!anonymousId) {
				anonymousId = await getProjectId(
					typeof options.baseURL === "string" ? options.baseURL : undefined,
				);
			}
			await track({
				type: event.type,
				payload: event.payload,
				anonymousId,
			});
		},
	};
}
