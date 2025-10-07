import { env } from "@better-auth/core/env";
import { importRuntime } from "../utils/import-util";

function getVendor() {
	const hasAny = (...keys: string[]) =>
		keys.some((k) => Boolean((env as any)[k]));

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
	) {
		return "render";
	}

	if (
		hasAny("AWS_LAMBDA_FUNCTION_NAME", "AWS_EXECUTION_ENV", "LAMBDA_TASK_ROOT")
	) {
		return "aws";
	}

	if (
		hasAny(
			"GOOGLE_CLOUD_FUNCTION_NAME",
			"GOOGLE_CLOUD_PROJECT",
			"GCP_PROJECT",
			"K_SERVICE",
		)
	) {
		return "gcp";
	}

	if (
		hasAny(
			"AZURE_FUNCTION_NAME",
			"FUNCTIONS_WORKER_RUNTIME",
			"WEBSITE_INSTANCE_ID",
			"WEBSITE_SITE_NAME",
		)
	) {
		return "azure";
	}

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

export async function detectSystemInfo() {
	try {
		//check if it's cloudflare
		if (getVendor() === "cloudflare") return "cloudflare";
		const os = await importRuntime<typeof import("os")>("os");
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
			isTTY:
				typeof process !== "undefined" && (process as any).stdout
					? (process as any).stdout.isTTY
					: null,
		};
	} catch (e) {
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

let isDockerCached: boolean | undefined;

async function hasDockerEnv() {
	if (getVendor() === "cloudflare") return false;

	try {
		const fs = await importRuntime<typeof import("fs")>("fs");
		fs.statSync("/.dockerenv");
		return true;
	} catch {
		return false;
	}
}

async function hasDockerCGroup() {
	if (getVendor() === "cloudflare") return false;
	try {
		const fs = await importRuntime<typeof import("fs")>("fs");
		return fs.readFileSync("/proc/self/cgroup", "utf8").includes("docker");
	} catch {
		return false;
	}
}

async function isDocker() {
	if (getVendor() === "cloudflare") return false;

	if (isDockerCached === undefined) {
		isDockerCached = (await hasDockerEnv()) || (await hasDockerCGroup());
	}

	return isDockerCached;
}

async function isWsl() {
	try {
		if (getVendor() === "cloudflare") return false;
		if (typeof process === "undefined" || process?.platform !== "linux") {
			return false;
		}
		const fs = await importRuntime<typeof import("fs")>("fs");
		const os = await importRuntime<typeof import("os")>("os");
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

let isInsideContainerCached: boolean | undefined;

const hasContainerEnv = async () => {
	if (getVendor() === "cloudflare") return false;
	try {
		const fs = await importRuntime<typeof import("fs")>("fs");
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

export function isCI() {
	return (
		env.CI !== "false" &&
		("BUILD_ID" in env || // Jenkins, Cloudbees
			"BUILD_NUMBER" in env || // Jenkins, TeamCity (fixed typo: extra space removed)
			"CI" in env || // Travis CI, CircleCI, Cirrus CI, Gitlab CI, Appveyor, CodeShip, dsari, Cloudflare
			"CI_APP_ID" in env || // Appflow
			"CI_BUILD_ID" in env || // Appflow
			"CI_BUILD_NUMBER" in env || // Appflow
			"CI_NAME" in env || // Codeship and others
			"CONTINUOUS_INTEGRATION" in env || // Travis CI, Cirrus CI
			"RUN_ID" in env) // TaskCluster, dsari
	);
}
