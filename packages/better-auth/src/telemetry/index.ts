import { randomBytes } from "node:crypto";

import { generateId } from "../utils/id";
import { getEnvVar, getBooleanEnvVar } from "../utils/env";

import type { AuthContext } from "../types";
import type { GlobalConfig } from "../config";

import {
	debugEndpoint,
	realEndpoint,
	type TelemetryEndpoint,
} from "./endpoint";
import { TELEMETRY_CONFIG_KEY, TELEMETRY_ID_CONFIG_KEY } from "./config-key";

const TELEMETRY_ENDPOINT = "http://localhost:4000/v1/track";

type Logger = AuthContext["logger"];

interface TelemetryOptions {
	logger: Logger;
	config: GlobalConfig;
}

export class Telemetry {
	private telemetryId: string | undefined = undefined;

	private logger: Logger;
	private config: GlobalConfig;
	private telemetryEndpoint: TelemetryEndpoint;

	constructor({ logger, config }: TelemetryOptions) {
		this.logger = logger;
		this.config = config;

		const debugEnabled = getBooleanEnvVar("BETTER_AUTH_TELEMETRY_DEBUG", true);
		this.telemetryEndpoint = debugEnabled
			? debugEndpoint(logger)
			: realEndpoint;
	}

	public async isEnabled() {
		const telemetryConfig = await this.config.getWithFallback(
			TELEMETRY_CONFIG_KEY,
			() => "true",
		);

		const envEnabled = getBooleanEnvVar("BETTER_AUTH_TELEMETRY", true);
		const telemetryConfigEnabled = telemetryConfig === "true";

		return telemetryConfigEnabled && envEnabled;
	}

	public async anonymousId() {
		if (this.telemetryId) return this.telemetryId;

		this.telemetryId = await this.config.getWithFallback(
			TELEMETRY_ID_CONFIG_KEY,
			() => randomBytes(32).toString("hex"),
		);
		return this.telemetryId;
	}
}

interface TelemetryEvent {
	event: "auth_";
	anonymousId: string;
	isProduction: boolean;
	plugins: string[];
	lastUpdated: number;
	version: string;
	betterAuthVersion: string;
	nodeVersion?: string;
	runtime?: string;
	framework?: string;
	database?: string;
	authConfig?: string;
}

function getTelemetryId(): string {
	const envId = getEnvVar("BETTER_AUTH_TELEMETRY_ID");
	if (envId) return envId;

	const id = generateId(32);

	if (typeof process !== "undefined" && process.env) {
		process.env.BETTER_AUTH_TELEMETRY_ID = id;
		// @ts-ignore
	} else if (typeof Deno !== "undefined") {
		Deno.env.set("BETTER_AUTH_TELEMETRY_ID", id);
	} else if (typeof Bun !== "undefined") {
		Bun.env.BETTER_AUTH_TELEMETRY_ID = id;
	}

	return id;
}

function isTelemetryEnabled(): boolean {
	return getBooleanEnvVar("BETTER_AUTH_TELEMETRY", true);
}

function getRuntime(): string {
	if (typeof Deno !== "undefined") return "deno";
	if (typeof Bun !== "undefined") return "bun";
	if (typeof process !== "undefined") return "node";
	return "unknown";
}

function detectFramework(): string | undefined {
	try {
		// Check for Next.js
		if (typeof require !== "undefined") {
			try {
				require("next");
				return "next";
			} catch {}
		}

		// Check for SvelteKit
		if (typeof import.meta !== "undefined") {
			try {
				import("@sveltejs/kit");
				return "sveltekit";
			} catch {}
		}

		// Check for Nuxt
		if (typeof require !== "undefined") {
			try {
				require("nuxt");
				return "nuxt";
			} catch {}
		}

		// Check for Remix
		if (typeof require !== "undefined") {
			try {
				require("@remix-run/server-runtime");
				return "remix";
			} catch {}
		}

		// Check for Astro
		if (typeof require !== "undefined") {
			try {
				require("astro");
				return "astro";
			} catch {}
		}

		// Try to detect from package.json dependencies
		if (
			typeof process !== "undefined" &&
			process.env.npm_package_dependencies
		) {
			try {
				const deps = JSON.parse(process.env.npm_package_dependencies);
				if (deps.next) return "next";
				if (deps["@sveltejs/kit"]) return "sveltekit";
				if (deps.nuxt) return "nuxt";
				if (deps["@remix-run/server-runtime"]) return "remix";
				if (deps.astro) return "astro";
			} catch {}
		}

		return undefined;
	} catch {
		return undefined;
	}
}

function detectBetterAuthVersion(): string {
	try {
		if (typeof process !== "undefined") {
			try {
				const fs = require("fs");
				const path = require("path");

				let currentDir = process.cwd();
				while (currentDir !== path.parse(currentDir).root) {
					const packageJsonPath = path.join(currentDir, "package.json");
					if (fs.existsSync(packageJsonPath)) {
						const packageJson = JSON.parse(
							fs.readFileSync(packageJsonPath, "utf8"),
						);
						const version =
							packageJson.dependencies?.["better-auth"] ||
							packageJson.devDependencies?.["better-auth"];
						if (version) {
							return version.replace(/[\^~>=]/g, "");
						}
					}
					currentDir = path.dirname(currentDir);
				}
			} catch {}
		}

		return "unknown";
	} catch {
		return "unknown";
	}
}

function detectDatabaseType(): string | undefined {
	try {
		if (typeof process !== "undefined") {
			try {
				const fs = require("fs");
				const path = require("path");

				let currentDir = process.cwd();
				while (currentDir !== path.parse(currentDir).root) {
					const packageJsonPath = path.join(currentDir, "package.json");
					if (fs.existsSync(packageJsonPath)) {
						const packageJson = JSON.parse(
							fs.readFileSync(packageJsonPath, "utf8"),
						);
						const deps = {
							...packageJson.dependencies,
							...packageJson.devDependencies,
						};

						if (deps["@prisma/client"]) return "prisma";
						if (deps["drizzle-orm"]) return "drizzle";
						if (deps["mongodb"]) return "mongodb";
						if (deps["better-sqlite3"]) return "sqlite";
						if (deps["pg"]) return "postgres";
						if (deps["mysql2"]) return "mysql";
						if (deps["kysely"]) return "kysely";
					}
					currentDir = path.dirname(currentDir);
				}
			} catch {}
		}

		return undefined;
	} catch {
		return undefined;
	}
}

function sanitizeAuthConfig(config: any): any {
	if (!config) return undefined;

	const sanitized = JSON.parse(JSON.stringify(config));

	const sensitiveFields = [
		"secret",
		"password",
		"token",
		"key",
		"apiKey",
		"clientSecret",
		"privateKey",
		"credentials",
		"connection",
		"connectionString",
		"uri",
		"url",
	];

	function sanitizeObject(obj: any) {
		if (!obj || typeof obj !== "object") return;

		for (const key of Object.keys(obj)) {
			const lowerKey = key.toLowerCase();

			if (
				sensitiveFields.some((field) => lowerKey.includes(field.toLowerCase()))
			) {
				obj[key] = "[REDACTED]";
				continue;
			}

			if (obj[key] && typeof obj[key] === "object") {
				sanitizeObject(obj[key]);
			}
		}
	}

	sanitizeObject(sanitized);
	return sanitized;
}

export function trackEvents(authConfig: any) {
	if (!isTelemetryEnabled()) return;
	console.log("auth config: ", authConfig);
	const plugins = [
		...new Map(
			(authConfig.plugins || []).map((p: any) => [
				p.name || p.id || "unknown",
				{ name: p.name || p.id || "unknown" },
			]),
		).values(),
	] as any[];

	sendDeviceState(plugins, authConfig);
}

async function sendDeviceState(plugins: { name: string }[], config?: any) {
	if (!isTelemetryEnabled()) return;

	try {
		const telemetryId = getTelemetryId();
		const isProduction = getEnvVar("NODE_ENV") === "production";

		const event: TelemetryEvent = {
			event: "auth_",
			anonymousId: telemetryId,
			isProduction,
			plugins: plugins.map((p) => p.name),
			lastUpdated: Date.now(),
			version: detectBetterAuthVersion(),
			betterAuthVersion: detectBetterAuthVersion(),
			nodeVersion: typeof process !== "undefined" ? process.version : undefined,
			runtime: getRuntime(),
			framework: detectFramework(),
			database: detectDatabaseType(),
			authConfig: config
				? JSON.stringify(sanitizeAuthConfig(config))
				: undefined,
		};

		await fetch(TELEMETRY_ENDPOINT, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(event),
		});
	} catch {
		// Ignore telemetry errors
	}
}

export { trackEvents as trackState };
