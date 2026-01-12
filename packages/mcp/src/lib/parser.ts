import type { DetectedConfig, ExistingSetup, Feature } from "./types.js";

export function parseExistingSetup(
	existingSetup: ExistingSetup,
): DetectedConfig {
	const detected: DetectedConfig = {
		features: [],
	};

	if (existingSetup.authConfig) {
		const config = existingSetup.authConfig;
		detected.database = detectDatabase(config);
		detected.orm = detectORM(config);
		detected.features = detectFeatures(config, existingSetup.authClientConfig);
	}

	return detected;
}

function detectDatabase(config: string): string | undefined {
	if (
		/provider:\s*["']postgresql["']/.test(config) ||
		/provider:\s*["']pg["']/.test(config)
	) {
		return "postgres";
	}
	if (/provider:\s*["']mysql["']/.test(config)) {
		return "mysql";
	}
	if (/provider:\s*["']sqlite["']/.test(config)) {
		return "sqlite";
	}
	if (/provider:\s*["']mongodb["']/.test(config)) {
		return "mongodb";
	}
	return undefined;
}

function detectORM(config: string): string | undefined {
	if (/prismaAdapter\(/.test(config)) {
		return "prisma";
	}
	if (/drizzleAdapter\(/.test(config)) {
		return "drizzle";
	}
	if (/database:\s*\{[\s\S]*provider:/.test(config)) {
		return "none";
	}
	return undefined;
}

function detectFeatures(
	serverConfig: string,
	clientConfig?: string,
): Feature[] {
	const features: Feature[] = [];

	if (/emailAndPassword:\s*\{[\s\S]*enabled:\s*true/.test(serverConfig)) {
		features.push("email-password");
	}

	const socialProviders: Feature[] = [
		"google",
		"github",
		"apple",
		"discord",
		"twitter",
		"facebook",
		"microsoft",
		"linkedin",
	];

	for (const provider of socialProviders) {
		if (new RegExp(`${provider}:\\s*\\{`).test(serverConfig)) {
			features.push(provider);
		}
	}

	const pluginPatterns: [RegExp, Feature][] = [
		[/twoFactor\(/, "2fa"],
		[/organization\(/, "organization"],
		[/admin\(/, "admin"],
		[/username\(/, "username"],
		[/multiSession\(/, "multi-session"],
		[/apiKey\(/, "api-key"],
		[/bearer\(/, "bearer"],
		[/jwt\(/, "jwt"],
		[/magicLink\(/, "magic-link"],
		[/phoneNumber\(/, "phone-number"],
		[/passkey\(/, "passkey"],
		[/anonymous\(/, "anonymous"],
		[/captcha\(/, "captcha"],
	];

	for (const [pattern, feature] of pluginPatterns) {
		if (pattern.test(serverConfig)) {
			features.push(feature);
		}
	}

	return features;
}

export function clientHasPlugin(clientConfig: string, plugin: string): boolean {
	const pluginPatterns: Record<string, RegExp> = {
		"2fa": /twoFactorClient\(/,
		organization: /organizationClient\(/,
		admin: /adminClient\(/,
		username: /usernameClient\(/,
		"multi-session": /multiSessionClient\(/,
		"api-key": /apiKeyClient\(/,
		"magic-link": /magicLinkClient\(/,
		"phone-number": /phoneNumberClient\(/,
		passkey: /passkeyClient\(/,
		anonymous: /anonymousClient\(/,
	};

	const pattern = pluginPatterns[plugin];
	return pattern ? pattern.test(clientConfig) : false;
}

export function getMissingClientPlugins(
	serverConfig: string,
	clientConfig: string,
): Feature[] {
	const serverFeatures = detectFeatures(serverConfig);
	const missingPlugins: Feature[] = [];

	const pluginsRequiringClient: Feature[] = [
		"2fa",
		"organization",
		"admin",
		"username",
		"multi-session",
		"api-key",
		"magic-link",
		"phone-number",
		"passkey",
		"anonymous",
	];

	for (const feature of serverFeatures) {
		if (
			pluginsRequiringClient.includes(feature) &&
			!clientHasPlugin(clientConfig, feature)
		) {
			missingPlugins.push(feature);
		}
	}

	return missingPlugins;
}

export function computeFeatureDiff(
	existing: Feature[],
	requested: Feature[],
): { toAdd: Feature[]; existing: Feature[] } {
	const toAdd = requested.filter((f) => !existing.includes(f));
	const existingFeatures = requested.filter((f) => existing.includes(f));
	return { toAdd, existing: existingFeatures };
}

export function checkExistingEnvVars(
	envVarNames: string[],
	existingEnvVars: string[],
): { name: string; exists: boolean }[] {
	return envVarNames.map((name) => ({
		name,
		exists: existingEnvVars.includes(name),
	}));
}
