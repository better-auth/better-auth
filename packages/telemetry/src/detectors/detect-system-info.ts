import { env } from "@better-auth/core/env";

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

// In the default (non-node) build, system info detection is not available.
// The node build (src/node.ts) provides its own inline implementation
// using static top-level imports of node:os and node:fs.
export async function detectSystemInfo() {
	return {
		deploymentVendor: getVendor(),
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

export function isCI() {
	return (
		env.CI !== "false" &&
		("BUILD_ID" in env || // Jenkins, Cloudbees
			"BUILD_NUMBER" in env || // Jenkins, TeamCity
			"CI" in env || // Travis CI, CircleCI, Cirrus CI, Gitlab CI, Appveyor, CodeShip, dsari, Cloudflare
			"CI_APP_ID" in env || // Appflow
			"CI_BUILD_ID" in env || // Appflow
			"CI_BUILD_NUMBER" in env || // Appflow
			"CI_NAME" in env || // Codeship and others
			"CONTINUOUS_INTEGRATION" in env || // Travis CI, Cirrus CI
			"RUN_ID" in env) // TaskCluster, dsari
	);
}
