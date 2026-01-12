import { computeFeatureDiff, parseExistingSetup } from "./parser.js";
import {
	generateDatabaseConfig,
	getDatabaseCommands,
	getDatabaseEnvVar,
} from "./templates/database.js";
import {
	categorizeFeatures,
	generatePluginImports,
	generatePluginSetup,
	generateSocialProviderConfig,
	getPluginEnvVars,
	getSocialProviderEnvVars,
} from "./templates/features.js";
import {
	FRAMEWORK_CONFIGS,
	getDefaultApiPath,
	getDefaultAuthPath,
} from "./templates/frameworks.js";
import type {
	Command,
	Database,
	DocLink,
	EnvVar,
	Feature,
	Framework,
	ORM,
	OutputFile,
	SetupAuthError,
	SetupAuthInput,
	SetupAuthOutput,
} from "./types.js";

export function generateSetup(
	input: SetupAuthInput,
): SetupAuthOutput | SetupAuthError {
	const framework = input.framework;
	const database = input.database;
	const orm = input.orm || "none";
	const features = input.features || ["email-password"];
	const typescript = input.typescript ?? true;
	const srcDir = input.srcDir ?? FRAMEWORK_CONFIGS[framework].defaultSrcDir;

	const authPath = input.authPath || getDefaultAuthPath(framework, srcDir);
	const apiPath = input.apiPath || getDefaultApiPath(framework, srcDir);

	let mode: "create" | "update" = "create";
	let featuresToGenerate = features;
	let detected: ReturnType<typeof parseExistingSetup> | undefined;

	if (input.existingSetup?.authConfig) {
		mode = "update";
		detected = parseExistingSetup(input.existingSetup);
		const diff = computeFeatureDiff(detected.features as Feature[], features);
		featuresToGenerate = diff.toAdd;

		if (featuresToGenerate.length === 0) {
			return {
				mode: "update",
				files: [],
				envVars: [],
				commands: [],
				detected,
				nextSteps: ["All requested features are already configured"],
				docs: [],
			};
		}
	}

	const { socialProviders, plugins, hasEmailPassword } =
		categorizeFeatures(featuresToGenerate);

	const files: OutputFile[] = [];
	const envVars: EnvVar[] = [];
	const commands: Command[] = [];
	const warnings: string[] = [];

	envVars.push({
		name: "BETTER_AUTH_SECRET",
		description: "Secret key for signing tokens",
		required: true,
		howToGet: "Run: npx @better-auth/cli secret",
	});

	envVars.push(getDatabaseEnvVar(database));

	for (const provider of socialProviders) {
		envVars.push(...getSocialProviderEnvVars(provider));
	}

	envVars.push(...getPluginEnvVars(plugins));

	if (mode === "create") {
		const authFile = generateAuthFile({
			framework,
			database,
			orm,
			socialProviders,
			plugins,
			hasEmailPassword,
			typescript,
		});

		files.push({
			path: `${authPath}.${typescript ? "ts" : "js"}`,
			description: "Better Auth server configuration",
			action: "create",
			content: authFile,
		});

		const clientFile = generateClientFile({
			framework,
			plugins,
			typescript,
		});

		files.push({
			path: `${authPath}-client.${typescript ? "ts" : "js"}`,
			description: "Better Auth client configuration",
			action: "create",
			content: clientFile,
		});

		if (apiPath) {
			const apiFile = generateApiRouteFile(framework, authPath);
			if (apiFile) {
				files.push({
					path: `${apiPath}/route.${typescript ? "ts" : "js"}`,
					description: "API route handler for auth endpoints",
					action: "create",
					content: apiFile,
				});
			}
		}

		const frameworkConfig = FRAMEWORK_CONFIGS[framework];
		if (frameworkConfig.hooksTemplate) {
			files.push({
				path: srcDir ? "src/hooks.server.ts" : "hooks.server.ts",
				description: "SvelteKit hooks for auth handling",
				action: "create",
				content: frameworkConfig.hooksTemplate(authPath),
			});
		}
	} else {
		if (socialProviders.length > 0 || plugins.length > 0) {
			const changes = generateUpdateChanges({
				socialProviders,
				plugins,
				hasEmailPassword,
			});

			files.push({
				path: `${authPath}.${typescript ? "ts" : "js"}`,
				description: "Better Auth server configuration",
				action: "update",
				changes: changes.serverChanges,
			});

			if (plugins.length > 0) {
				files.push({
					path: `${authPath}-client.${typescript ? "ts" : "js"}`,
					description: "Better Auth client configuration",
					action: "update",
					changes: changes.clientChanges,
				});
			}
		}
	}

	commands.push({
		command: "pnpm add better-auth",
		description: "Install Better Auth",
		when: "If not already installed",
	});

	commands.push(...getDatabaseCommands(orm));

	const nextSteps = generateNextSteps(mode, socialProviders, plugins);
	const docs = generateDocLinks(features);

	return {
		mode,
		files,
		envVars,
		commands,
		detected,
		nextSteps,
		warnings: warnings.length > 0 ? warnings : undefined,
		docs,
	};
}

function generateAuthFile(options: {
	framework: Framework;
	database: Database;
	orm: ORM;
	socialProviders: string[];
	plugins: string[];
	hasEmailPassword: boolean;
	typescript: boolean;
}): string {
	const { database, orm, socialProviders, plugins, hasEmailPassword } = options;

	const imports: string[] = ['import { betterAuth } from "better-auth";'];

	const {
		imports: dbImports,
		config: dbConfig,
		prismaInstance,
	} = generateDatabaseConfig(database, orm);

	if (dbImports) {
		imports.push(dbImports);
	}

	const { serverImports } = generatePluginImports(plugins);
	imports.push(...serverImports);

	const socialProvidersConfig = socialProviders
		.map((p) => `    ${generateSocialProviderConfig(p)}`)
		.join(",\n");

	const { serverPlugins } = generatePluginSetup(plugins);

	let configBody = `  database: ${dbConfig},`;

	if (hasEmailPassword) {
		configBody += `
  emailAndPassword: {
    enabled: true,
  },`;
	}

	if (socialProviders.length > 0) {
		configBody += `
  socialProviders: {
${socialProvidersConfig}
  },`;
	}

	if (serverPlugins.length > 0) {
		configBody += `
  plugins: [
    ${serverPlugins.join(",\n    ")}
  ],`;
	}

	return `${imports.join("\n")}
${prismaInstance || ""}
export const auth = betterAuth({
${configBody}
});
`;
}

function generateClientFile(options: {
	framework: Framework;
	plugins: string[];
	typescript: boolean;
}): string {
	const { framework, plugins } = options;

	const frameworkConfig = FRAMEWORK_CONFIGS[framework];
	const imports: string[] = [frameworkConfig.clientImport];

	const { clientImports } = generatePluginImports(plugins);
	imports.push(...clientImports);

	const { clientPlugins } = generatePluginSetup(plugins);

	let configBody = "";

	if (clientPlugins.length > 0) {
		configBody = `{
  plugins: [
    ${clientPlugins.join(",\n    ")}
  ],
}`;
	} else {
		configBody = "{}";
	}

	return `${imports.join("\n")}

export const authClient = createAuthClient(${configBody});
`;
}

function generateApiRouteFile(
	framework: Framework,
	authPath: string,
): string | null {
	const frameworkConfig = FRAMEWORK_CONFIGS[framework];

	if (!frameworkConfig.apiRouteTemplate) {
		return null;
	}

	const template = frameworkConfig.apiRouteTemplate(authPath);
	return template || null;
}

function generateUpdateChanges(options: {
	socialProviders: string[];
	plugins: string[];
	hasEmailPassword: boolean;
}): {
	serverChanges: { type: string; content: string; description: string }[];
	clientChanges: { type: string; content: string; description: string }[];
} {
	const { socialProviders, plugins } = options;

	const serverChanges: {
		type: string;
		content: string;
		description: string;
	}[] = [];
	const clientChanges: {
		type: string;
		content: string;
		description: string;
	}[] = [];

	const { serverImports, clientImports } = generatePluginImports(plugins);

	for (const imp of serverImports) {
		serverChanges.push({
			type: "add_import",
			content: imp,
			description: "Add plugin import",
		});
	}

	for (const provider of socialProviders) {
		serverChanges.push({
			type: "add_to_config",
			content: generateSocialProviderConfig(provider),
			description: `Add ${provider} social provider`,
		});
	}

	const { serverPlugins, clientPlugins } = generatePluginSetup(plugins);

	for (const plugin of serverPlugins) {
		serverChanges.push({
			type: "add_plugin",
			content: plugin,
			description: "Add server plugin",
		});
	}

	for (const imp of clientImports) {
		clientChanges.push({
			type: "add_import",
			content: imp,
			description: "Add client plugin import",
		});
	}

	for (const plugin of clientPlugins) {
		clientChanges.push({
			type: "add_plugin",
			content: plugin,
			description: "Add client plugin",
		});
	}

	return { serverChanges, clientChanges };
}

function generateNextSteps(
	mode: "create" | "update",
	socialProviders: string[],
	plugins: string[],
): string[] {
	const steps: string[] = [];

	if (mode === "create") {
		steps.push("Set environment variables in .env file");
		steps.push("Run database migrations");
	}

	if (socialProviders.length > 0) {
		steps.push(`Configure OAuth apps for: ${socialProviders.join(", ")}`);
		steps.push("Add callback URLs to OAuth provider dashboards");
	}

	if (plugins.includes("magic-link")) {
		steps.push("Configure email provider for magic links");
	}

	if (plugins.includes("phone-number")) {
		steps.push("Configure SMS provider for OTP");
	}

	if (plugins.includes("captcha")) {
		steps.push(
			"Set up captcha provider (Cloudflare Turnstile, reCAPTCHA, or hCaptcha)",
		);
	}

	steps.push("Start your development server and test auth flow");

	return steps;
}

function generateDocLinks(features: Feature[]): DocLink[] {
	const docs: DocLink[] = [
		{
			title: "Better Auth Documentation",
			url: "https://www.better-auth.com/docs",
		},
		{
			title: "Getting Started",
			url: "https://www.better-auth.com/docs/getting-started",
		},
	];

	if (
		features.some((f) => ["google", "github", "apple", "discord"].includes(f))
	) {
		docs.push({
			title: "Social Sign-On",
			url: "https://www.better-auth.com/docs/authentication/social-sign-on",
		});
	}

	if (features.includes("2fa")) {
		docs.push({
			title: "Two-Factor Authentication",
			url: "https://www.better-auth.com/docs/plugins/two-factor",
		});
	}

	if (features.includes("organization")) {
		docs.push({
			title: "Organizations",
			url: "https://www.better-auth.com/docs/plugins/organization",
		});
	}

	if (features.includes("passkey")) {
		docs.push({
			title: "Passkeys",
			url: "https://www.better-auth.com/docs/plugins/passkey",
		});
	}

	return docs;
}

export function isSetupError(
	result: SetupAuthOutput | SetupAuthError,
): result is SetupAuthError {
	return "error" in result;
}
