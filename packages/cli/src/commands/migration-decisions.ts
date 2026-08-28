import { link, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { migrateFrom16 } from "better-auth/db/migration";
import * as z from "zod";

/** File name the guided 1.6 migration reads and writes its reviewed decisions from. */
export const MIGRATION_DECISIONS_FILE = "better-auth-migration.json";

/** Release transition authorized by the current decisions artifact. */
export const RELEASE_MIGRATION_ID = "1.6-to-1.7" as const;

export type ReleaseMigrationOptions = Parameters<typeof migrateFrom16>[1];

const migrationDecisionsSchema = z.strictObject({
	formatVersion: z.literal(1),
	migration: z.literal(RELEASE_MIGRATION_ID),
	legacyTableNames: z
		.strictObject({
			oauthAccessToken: z.string().trim().min(1).nullish(),
			oauthApplication: z.string().trim().min(1).nullish(),
			oauthConsent: z.string().trim().min(1).nullish(),
			scimProvider: z.string().trim().min(1).nullish(),
		})
		.optional(),
	oauth: z
		.strictObject({
			clientSecrets: z
				.strictObject({
					source: z.enum(["custom", "encrypted", "hashed", "plain"]),
					target: z.enum(["custom", "encrypted", "hashed"]),
				})
				.optional(),
			consents: z.enum(["migrate", "reauthorize"]),
		})
		.optional(),
	scim: z
		.strictObject({
			retireAccountIds: z.array(z.string().min(1)),
		})
		.optional(),
});

/** Reviewed answers to the identified release migration decisions. */
export type MigrationDecisions = z.infer<typeof migrationDecisionsSchema>;

/**
 * Reads a decisions file, rejecting invalid JSON, unknown keys, and any format
 * version this CLI does not understand.
 */
export async function loadMigrationDecisions(
	filePath: string,
): Promise<MigrationDecisions> {
	let contents: string;
	try {
		contents = await readFile(filePath, "utf8");
	} catch {
		throw new Error(
			`Could not read the migration decisions file "${filePath}".`,
		);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(contents);
	} catch {
		throw new Error(
			`The migration decisions file "${filePath}" is not valid JSON.`,
		);
	}
	const decisions = migrationDecisionsSchema.safeParse(parsed);
	if (!decisions.success) {
		const issues = decisions.error.issues
			.map(
				(issue) => `-> ${issue.path.join(".") || "(root)"}: ${issue.message}`,
			)
			.join("\n");
		throw new Error(
			`The migration decisions file "${filePath}" is invalid:\n${issues}`,
		);
	}
	return decisions.data;
}

function isFileSystemError(error: unknown, code: string) {
	return (
		error instanceof Error &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === code
	);
}

async function readExistingDecisions(filePath: string) {
	try {
		return await readFile(filePath, "utf8");
	} catch (error) {
		if (isFileSystemError(error, "ENOENT")) return undefined;
		throw error;
	}
}

function decisionsConflict(filePath: string) {
	return new Error(
		`The migration decisions file "${filePath}" already exists with different decisions and was not changed. Move it or pass it back with \`auth migrate apply "${filePath}"\`.`,
	);
}

/**
 * Creates a reviewed decisions artifact without replacing a different file.
 * The hard link publishes only a fully written file and fails if another
 * process wins the same path.
 */
export async function writeMigrationDecisions(
	filePath: string,
	decisions: MigrationDecisions,
): Promise<"created" | "reused"> {
	const contents = `${JSON.stringify(decisions, null, 2)}\n`;
	const existing = await readExistingDecisions(filePath);
	if (existing !== undefined) {
		if (existing === contents) return "reused";
		throw decisionsConflict(filePath);
	}

	const temporaryDirectory = await mkdtemp(
		path.join(path.dirname(filePath), `.${path.basename(filePath)}-`),
	);
	const temporaryFile = path.join(temporaryDirectory, "decisions.json");
	try {
		await writeFile(temporaryFile, contents, { encoding: "utf8", flag: "wx" });
		try {
			await link(temporaryFile, filePath);
			return "created";
		} catch (error) {
			if (!isFileSystemError(error, "EEXIST")) throw error;
			const concurrent = await readExistingDecisions(filePath);
			if (concurrent === contents) return "reused";
			throw decisionsConflict(filePath);
		}
	} finally {
		await rm(temporaryDirectory, { force: true, recursive: true });
	}
}

/**
 * Expands reviewed decisions into release migration options. Token revocation,
 * client migration, and SCIM reprovisioning have no alternative, so the file
 * records the decision that reaches them rather than the value itself.
 */
export function toReleaseMigrationOptions(
	decisions: MigrationDecisions | undefined,
): ReleaseMigrationOptions {
	return {
		legacyTableNames: decisions?.legacyTableNames,
		oauthProvider: decisions?.oauth && {
			clients: "migrate",
			clientSecrets: decisions.oauth.clientSecrets,
			consents: decisions.oauth.consents,
			tokens: "revoke",
		},
		scim: decisions?.scim && {
			accountIdsToRetire: decisions.scim.retireAccountIds,
			providers: "reprovision",
		},
	};
}
