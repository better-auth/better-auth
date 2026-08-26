import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

interface CommandResult {
	exitCode: number | null;
	stderr: string;
	stdout: string;
}

interface PublishedAccount {
	accountId: string;
	id: string;
	providerId: string;
	userId: string;
}

interface Published16Result {
	accounts: PublishedAccount[];
	administratorUserId: string;
	clientId: string;
	clientSecret: string;
	directorySubject: string;
	scimAccountId: string;
	tableCounts: Record<string, number>;
}

interface GuidedVerificationResult {
	credentialUserId: string;
	reprovisionedSCIMUserId: string;
	scimUserId: string;
	ssoUserId: string;
}

export interface MigratedPublished16Database {
	source: Published16Result;
	verified: GuidedVerificationResult;
}

const workspaceRootDirectory = resolve(process.cwd(), "../..");
const migrationFixtureDirectory = join(
	workspaceRootDirectory,
	"e2e/adapter/test/kysely-adapter",
);
const published16Directory = join(
	migrationFixtureDirectory,
	"published-1-6-app",
);
const published16Seed = join(published16Directory, "seed.mjs");
const guidedConfig = join(migrationFixtureDirectory, "guided-auth.mjs");
const guidedVerifier = join(
	migrationFixtureDirectory,
	"verify-guided-migration.mjs",
);
const cliEntry = join(workspaceRootDirectory, "packages/cli/dist/index.mjs");
const commandTimeoutMs = 60_000;

function redactCommandOutput(output: string): string {
	return output
		.replace(
			/^PUBLISHED_FIXTURE_RESULT=.*$/gm,
			"PUBLISHED_FIXTURE_RESULT=[redacted]",
		)
		.replace(
			/^GUIDED_MIGRATION_RESULT=.*$/gm,
			"GUIDED_MIGRATION_RESULT=[redacted]",
		);
}

function runNode(
	cwd: string,
	args: string[],
	environment: NodeJS.ProcessEnv = {},
): Promise<CommandResult> {
	return new Promise((resolveCommand, rejectCommand) => {
		const child = spawn(process.execPath, args, {
			cwd,
			env: { ...process.env, ...environment, NO_COLOR: "1" },
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		let settled = false;
		let timeout: ReturnType<typeof setTimeout>;
		const settle = (callback: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			callback();
		};
		timeout = setTimeout(() => {
			child.kill();
			settle(() =>
				rejectCommand(
					new Error(
						`Subprocess timed out after ${commandTimeoutMs}ms:\n${redactCommandOutput(stdout)}\n${redactCommandOutput(stderr)}`,
					),
				),
			);
		}, commandTimeoutMs);
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.once("error", (error) => {
			settle(() => rejectCommand(error));
		});
		child.once("close", (exitCode) => {
			settle(() => resolveCommand({ exitCode, stderr, stdout }));
		});
	});
}

function requireSuccessfulCommand(
	result: CommandResult,
	context: string,
): void {
	if (result.exitCode === 0) return;
	throw new Error(
		`${context} failed with exit code ${result.exitCode}:\n${redactCommandOutput(result.stdout)}\n${redactCommandOutput(result.stderr)}`,
	);
}

function readSentinelResult<Result>(stdout: string, sentinel: string): Result {
	const line = stdout
		.split("\n")
		.find((candidate) => candidate.startsWith(`${sentinel}=`));
	if (!line) {
		throw new Error(
			`Missing ${sentinel} in subprocess output:\n${redactCommandOutput(stdout)}`,
		);
	}
	return JSON.parse(line.slice(sentinel.length + 1)) as Result;
}

async function requireFixtureFiles(): Promise<void> {
	for (const requiredFile of [
		cliEntry,
		published16Seed,
		guidedConfig,
		guidedVerifier,
	]) {
		if (!existsSync(requiredFile)) {
			throw new Error(`Missing published migration fixture: ${requiredFile}`);
		}
	}
	const packageMetadata = JSON.parse(
		await readFile(
			join(published16Directory, "node_modules/better-auth/package.json"),
			"utf8",
		),
	) as { version?: string };
	if (packageMetadata.version !== "1.6.30") {
		throw new Error(
			`Expected the published 1.6 fixture to use better-auth 1.6.30, received ${packageMetadata.version ?? "unknown"}`,
		);
	}
}

export async function prepareMigratedPublished16Database(
	databasePath: string,
	authSecret: string,
): Promise<MigratedPublished16Database> {
	await requireFixtureFiles();

	const environment = {
		BETTER_AUTH_MIGRATION_DATABASE: databasePath,
		BETTER_AUTH_SECRET: authSecret,
	};
	const seed = await runNode(
		published16Directory,
		[published16Seed, databasePath],
		environment,
	);
	requireSuccessfulCommand(seed, "Published Better Auth 1.6 seed");
	const source = readSentinelResult<Published16Result>(
		seed.stdout,
		"PUBLISHED_FIXTURE_RESULT",
	);
	const sourceProviders = source.accounts.map(({ providerId }) => providerId);
	if (
		source.tableCounts.account !== 3 ||
		!sourceProviders.includes("credential") ||
		!sourceProviders.includes("workforce-scim") ||
		!sourceProviders.includes("workforce-sso")
	) {
		throw new Error(
			`Published Better Auth 1.6 did not create the required populated workflows: accountCount=${source.tableCounts.account ?? "unknown"}, providers=${sourceProviders.join(",")}`,
		);
	}

	const decisionsFile = join(
		dirname(databasePath),
		"better-auth-migration.json",
	);
	await writeFile(
		decisionsFile,
		`${JSON.stringify(
			{
				formatVersion: 1,
				migration: "1.6-to-1.7",
				oauth: {
					clientSecrets: { source: "plain", target: "hashed" },
					consents: "migrate",
				},
				scim: { retireAccountIds: [source.scimAccountId] },
			},
			null,
			2,
		)}\n`,
		"utf8",
	);

	const plan = await runNode(
		migrationFixtureDirectory,
		[
			cliEntry,
			"migrate",
			"plan",
			decisionsFile,
			"--config",
			guidedConfig,
			"--json",
		],
		environment,
	);
	requireSuccessfulCommand(plan, "Guided Better Auth 1.7 migration plan");
	const parsedPlan = JSON.parse(plan.stdout) as {
		accountIdentity?: { selectedStrategy?: string };
		blockers?: unknown[];
		status?: string;
	};
	if (
		parsedPlan.status !== "ready" ||
		parsedPlan.blockers?.length !== 0 ||
		parsedPlan.accountIdentity?.selectedStrategy !== "provider-id"
	) {
		throw new Error(
			`Guided migration did not produce a ready provider-id plan: ${plan.stdout}`,
		);
	}

	const apply = await runNode(
		migrationFixtureDirectory,
		[
			cliEntry,
			"migrate",
			"apply",
			decisionsFile,
			"--config",
			guidedConfig,
			"--yes",
			"--json",
		],
		environment,
	);
	requireSuccessfulCommand(apply, "Guided Better Auth 1.7 migration apply");
	const parsedApply = JSON.parse(apply.stdout) as { status?: string };
	if (parsedApply.status !== "applied") {
		throw new Error(`Guided migration was not applied: ${apply.stdout}`);
	}

	const repeatedPlan = await runNode(
		migrationFixtureDirectory,
		[
			cliEntry,
			"migrate",
			"plan",
			decisionsFile,
			"--config",
			guidedConfig,
			"--json",
		],
		environment,
	);
	requireSuccessfulCommand(
		repeatedPlan,
		"Repeated Better Auth 1.7 migration plan",
	);
	const parsedRepeatedPlan = JSON.parse(repeatedPlan.stdout) as {
		blockers?: unknown[];
		changes?: {
			addColumns?: unknown[];
			addIndexes?: unknown[];
			createTables?: unknown[];
		};
		releaseMigration?: unknown;
		status?: string;
	};
	if (
		parsedRepeatedPlan.status !== "up-to-date" ||
		parsedRepeatedPlan.blockers?.length !== 0 ||
		parsedRepeatedPlan.changes?.addColumns?.length !== 0 ||
		parsedRepeatedPlan.changes?.addIndexes?.length !== 0 ||
		parsedRepeatedPlan.changes?.createTables?.length !== 0 ||
		parsedRepeatedPlan.releaseMigration !== undefined
	) {
		throw new Error(
			`Guided migration did not become up-to-date after apply: ${repeatedPlan.stdout}`,
		);
	}

	const provisionedSourceAccount = source.accounts.find(
		({ providerId }) => providerId === "workforce-scim",
	);
	if (!provisionedSourceAccount) {
		throw new Error("Published Better Auth 1.6 did not create a SCIM account");
	}
	const verification = await runNode(
		migrationFixtureDirectory,
		[guidedVerifier, databasePath],
		{
			...environment,
			BETTER_AUTH_MIGRATION_CLIENT_ID: source.clientId,
			BETTER_AUTH_MIGRATION_CLIENT_SECRET: source.clientSecret,
			BETTER_AUTH_MIGRATION_SCIM_USER_ID: provisionedSourceAccount.userId,
		},
	);
	requireSuccessfulCommand(
		verification,
		"Migrated Better Auth 1.7 workflow verification",
	);
	const verified = readSentinelResult<GuidedVerificationResult>(
		verification.stdout,
		"GUIDED_MIGRATION_RESULT",
	);

	return { source, verified };
}
