import { ENV, getBooleanEnvVar, isTest } from "../utils/env";
import { getProjectId } from "./project-id";
import type { BetterAuthOptions } from "../types";
import { detectEnvironment, detectRuntime } from "./detectors/detect-runtime";
import { detectDatabase } from "./detectors/detect-database";
import { detectFramework } from "./detectors/detect-framework";
import { detectSystemInfo } from "./detectors/detect-system-info";
import { detectPackageManager } from "./detectors/detect-project-info";
import { betterFetch } from "@better-fetch/fetch";
import type { TelemetryContext, TelemetryEvent } from "./types";
import { logger } from "../utils";
import { getTelemetryAuthConfig } from "./detectors/detect-auth-config";
import { importRuntime } from "../utils/import-util";

const message = `\n\n\x1b[36mBetter Auth\x1b[0m — Anonymous telemetry notice
\nWe collect minimal, completely anonymous usage telemetry to help improve Better Auth.

You can disable it at any time:
  • In your auth config: \x1b[33mtelemetry: { enabled: false }\x1b[0m
  • Or via env: \x1b[33mBETTER_AUTH_TELEMETRY=0\x1b[0m

You can also debug what would be sent by setting:
  • \x1b[33mBETTER_AUTH_TELEMETRY_DEBUG=1\x1b[0m

Learn more in the docs: https://www.better-auth.com/docs/reference/telemetry\n\n`;

async function configFilePath() {
	try {
		const path = await importRuntime<typeof import("path")>("path");
		const os = await importRuntime<typeof import("os")>("os");
		const baseDir =
			typeof process !== "undefined" && process.platform === "win32"
				? process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
				: path.join(os.homedir(), ".config");
		const dir = path.join(baseDir, "better-auth");
		const file = path.join(dir, "telemetry.json");

		return { file, dir };
	} catch {
		return {
			file: null,
			dir: null,
		};
	}
}

const shownNoticeInProcess = new Set<string>();

async function hasShownNoticeBefore(anonymousId: string) {
	try {
		const { file } = await configFilePath();

		if (!file) {
			return true;
		}

		const fs = await importRuntime<typeof import("fs/promises")>("fs/promises");
		const raw = await fs.readFile(file, "utf-8");
		const json = JSON.parse(raw) as { seen?: string[] };

		return Array.isArray(json.seen) && json.seen.includes(anonymousId);
	} catch (err: unknown) {
		if (
			err &&
			typeof err === "object" &&
			"code" in err &&
			(err as NodeJS.ErrnoException).code === "ENOENT"
		) {
			// if the file doesn't exist we know that the notice hasn't been shown before
			return false;
		}

		// an unknown error happened
		return true;
	}
}

async function markNoticeShown(anonymousId: string) {
	try {
		const fs = await importRuntime<typeof import("fs/promises")>("fs/promises");
		const { file, dir } = await configFilePath();
		if (!file || !dir) return;
		await fs.mkdir(dir, { recursive: true });
		let json: { seen: string[] } = { seen: [] };

		try {
			if (!file) return;
			const raw = await fs.readFile(file, "utf-8");
			const parsed = JSON.parse(raw) as { seen?: string[] };
			json.seen = Array.isArray(parsed.seen) ? parsed.seen : [];
		} catch {}

		if (!json.seen.includes(anonymousId)) {
			json.seen.push(anonymousId);
		}
		await fs.writeFile(file, JSON.stringify(json, null, 2), "utf-8");
	} catch {}
}

async function maybeShowTelemetryNotice(anonymousId: string) {
	if (shownNoticeInProcess.has(anonymousId)) return;

	if (typeof process !== "undefined" && process.stdout && !process.stdout.isTTY)
		return;

	if (await hasShownNoticeBefore(anonymousId)) {
		shownNoticeInProcess.add(anonymousId);
		return;
	}

	try {
		console.log(message);
	} catch {}

	shownNoticeInProcess.add(anonymousId);
	await markNoticeShown(anonymousId);
}

export async function createTelemetry(
	options: BetterAuthOptions,
	context?: TelemetryContext,
) {
	const debugEnabled =
		options.telemetry?.debug ||
		getBooleanEnvVar("BETTER_AUTH_TELEMETRY_DEBUG", false);

	const disableNotice =
		options.telemetry?.disableNotice ||
		options.telemetry?.enabled === false ||
		options.telemetry?.debug ||
		getBooleanEnvVar("BETTER_AUTH_TELEMETRY_DISABLE_NOTICE", false);

	const TELEMETRY_ENDPOINT = ENV.BETTER_AUTH_TELEMETRY_ENDPOINT;
	const track = async (event: TelemetryEvent) => {
		try {
			if (context?.customTrack) {
				await context.customTrack(event);
			} else {
				if (debugEnabled) {
					await Promise.resolve(
						logger.info("telemetry event", JSON.stringify(event, null, 2)),
					);
				} else {
					await betterFetch(TELEMETRY_ENDPOINT, {
						method: "POST",
						body: event,
					});
				}
			}
		} catch {}
	};

	const isEnabled = async () => {
		const telemetryEnabled =
			options.telemetry?.enabled !== undefined
				? options.telemetry.enabled
				: true;
		const envEnabled = getBooleanEnvVar("BETTER_AUTH_TELEMETRY", true);
		return (
			envEnabled && telemetryEnabled && (context?.skipTestCheck || !isTest())
		);
	};

	const anonymousId = await getProjectId(options.baseURL);

	const payload = {
		config: getTelemetryAuthConfig(options),
		runtime: detectRuntime(),
		database: await detectDatabase(),
		framework: await detectFramework(),
		environment: detectEnvironment(),
		systemInfo: await detectSystemInfo(),
		packageManager: detectPackageManager(),
	};
	const enabled = await isEnabled();

	if (enabled) {
		if (!disableNotice) {
			await maybeShowTelemetryNotice(anonymousId);
		}
		void track({ type: "init", payload, anonymousId });
	}

	return {
		publish: async (event: TelemetryEvent) => {
			if (!enabled) return;
			await track({
				type: event.type,
				payload: event.payload,
				anonymousId,
			});
		},
	};
}
