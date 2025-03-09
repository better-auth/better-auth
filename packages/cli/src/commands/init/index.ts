import { Command } from "commander";
import { z } from "zod";
import {
	db_schema_generation_or_migration_supported_databases,
	supportedDatabases,
	type SupportedDatabase,
} from "./supported-dbs";
import { cliVersionStep } from "./steps/1-cli-version";
import { prepareSteps } from "./step-utils";
import { intro, log, outro } from "@clack/prompts";
import { getFrameworkStep } from "./steps/2-get-framework";
import { betterAuthInstallationStep } from "./steps/3-better-auth-installation";
import type { PackageManager } from "./types";
import { checkAuthFilesStep } from "./steps/4-check-auth-files";
import { databaseAdapterStep } from "./steps/6-database-adapter";
import { supportedPluginIds, type SupportedPlugin } from "./supported-plugins";
import { appNameStep } from "./steps/5-app-name";
import { pluginStep } from "./steps/7-plugins";
import {
	supportedSocialProviderIds,
	type SupportedSocialProvider,
} from "./supported-social-providers";
import { socialProvidersStep } from "./steps/8-social-providers";
import { emailAndPasswordStep } from "./steps/9-email-password";
import chalk from "chalk";
import { currentlySupportedFrameworks } from "./supported-frameworks";
import { generateAuthFilesStep } from "./steps/10-generate-auth-files";
import { generateAuthApiRoute } from "./steps/11-generate-auth-api-route";
import { checkEnv } from "./steps/12-check-env";
import { checkTsConfig } from "./steps/13-check-tsconfig";

export interface RuntimeData {
	skippedSteps: string[];
	packageManager: PackageManager | null;
	database: SupportedDatabase | null;
	plugins: SupportedPlugin[] | null;
	appName: string | null;
	socialProviders: SupportedSocialProvider[] | null;
	emailAndPasswordAuthentication: boolean;
	authConfigPath: string | null;
	authClientConfigPath: string | null;
	envFiles: string[] | null;
}

const optionsSchema = z.object({
	cwd: z.string(),
	config: z.string().optional(),
	framework: z.enum(currentlySupportedFrameworks).optional(),
	// auth config options
	appName: z.string().optional(),
	database: z.enum(supportedDatabases).optional(),
	socialProviders: z
		.array(z.enum(supportedSocialProviderIds))
		.optional()
		.default([]),
	EmailPassword: z.boolean().optional(),
	plugins: z.array(z.enum(supportedPluginIds)).optional().default([]),
	// disable prompts
	SkipDb: z.boolean().optional(),
	SkipPlugins: z.boolean().optional(),
	SkipAppName: z.boolean().optional(),
	SkipSocialProviders: z.boolean().optional(),
	SkipEmailPassword: z.boolean().optional(),
});

export type Options = z.infer<typeof optionsSchema>;

const runOutro = () => {
	outro("🥳 All Done, if all went well, you're ready to go! 🎉");
};

// Notes:
// * Any given step should be skippable.
// * Any given step could fail but continue proceeding the rest of the steps.
// * User should be able to cancel at any step.

export async function initAction(opts: any) {
	const options: Options = optionsSchema.parse(opts);

	let runtime_data: RuntimeData = {
		skippedSteps: [],
		packageManager: null,
		database: null,
		plugins: null,
		appName: null,
		socialProviders: null,
		emailAndPasswordAuthentication: false,
		authClientConfigPath: null,
		authConfigPath: null,
		envFiles: null,
	};

	const { processStep, processSubStep } = prepareSteps({
		getRuntimeData: () => runtime_data,
		setRuntimeData: (d) => (runtime_data = d),
		runOutro,
		options,
	});

	console.log()
	intro(`👋 Welcome to the Better Auth init CLI!`);

	// Make sure Better Auth CLI is up-to-date
	await processStep(cliVersionStep);

	// Get framework
	const {
		result: { data: framework },
	} = await processStep(getFrameworkStep);
	if (framework === null) return; // impossible to reach. Doing this to satisfy TS.

	// Check if Better Auth is installed
	const {
		result: { data: isBetterAuthInstalled },
	} = await processStep(betterAuthInstallationStep);

	if (isBetterAuthInstalled === null) return; // impossible to reach. Doing this to satisfy TS.

	// Check if auth.ts & auth-client.ts is defined. If not, prompt to create them.
	const authFilesResult = await processStep(checkAuthFilesStep, framework);
	// either both auth & auth-client are defined, or neither are defined.
	// if `shouldCreateConfigs` is true, then assume both are not defined.
	const { shouldCreateConfigs } = authFilesResult.result.data!;

	// If auth.ts needs to be created, run the following sub-steps:
	if (shouldCreateConfigs) {
		// Create a sub step to ask for the app name
		await processSubStep(appNameStep);

		// Create a sub step to ask for which database adapter to use
		await processSubStep(databaseAdapterStep);

		// Create a sub step to ask for which plugins to use
		await processSubStep(pluginStep, framework);

		// Create a sub step to ask if they want social providers, and if so, which ones
		await processSubStep(socialProvidersStep);

		// Create a sub step to ask if they want email & password authentication
		await processSubStep(emailAndPasswordStep);

		// Start the process of creating the auth.ts & auth-client.ts files
		await processSubStep(generateAuthFilesStep, framework);
	}

	// Create the auth API route for the framework
	await processStep(generateAuthApiRoute, framework);

	// Check if the required ENVs are set
	await processStep(checkEnv);

	// Make sure `strict` is set to `true` in tsconfig.json
	await processStep(checkTsConfig);

	// if they set up auth.ts, then make sure to tell them to run migrate / generate.
	if (shouldCreateConfigs && (runtime_data.database || runtime_data.plugins)) {
		const { generation, migration } =
			db_schema_generation_or_migration_supported_databases.find(
				(x) => x.id === runtime_data.database,
			)!;
		if (!generation && !migration) {
			// user doesn't need to run either generate or migrate.
		} else if (!generation) {
			log.step(
				`🚀 Don't forget to run ${chalk.bold(
					`npx @better-auth/cli migrate`,
				)} to apply the schema to your database!`,
			);
		} else if (!migration) {
			log.step(
				`🚀 Don't forget to run ${chalk.bold(
					`npx @better-auth/cli generate`,
				)} to generate the schema to your database!`,
			);
		} else {
			log.step(
				`🚀 Don't forget to run ${chalk.bold(
					`npx @better-auth/cli migrate`,
				)} to apply the schema, or ${chalk.bold(
					`npx @better-auth/cli generate`,
				)} to generate the schema!`,
			);
		}
	}

	runOutro();
	process.exit(0);
}

export const init = new Command("init")
	.option("-c, --cwd <cwd>", "The working directory.", process.cwd())
	.option(
		"--config <config>",
		"The path to the auth configuration file. defaults to the first `auth.ts` file found.",
	)
	.option(`--framework <framework>`, "The framework of choice.")
	.option(`--app-name <appName>`, `The app name.`)
	.option(`--db, --database <database>`, `The database adapter of choice.`)
	.option(
		`--social-providers <socialProviders...>`,
		`The social providers of choice.`,
	)
	.option(`--plugins <plugins...>`, `The plugins of choice.`)
	.option(
		`-email-password`,
		`Whether to enable email & password authentication.`,
	)
	.option("-skip-db", "Skip the database setup.")
	.option("-skip-plugins", "Skip the plugins setup.")
	.option("-skip-app-name", "Skip the app name setup.")
	.option("-skip-social-providers", "Skip the social providers setup.")
	.option(
		"-skip-email-password",
		"Skip the email & password authentication setup.",
	)
	.action(initAction);
