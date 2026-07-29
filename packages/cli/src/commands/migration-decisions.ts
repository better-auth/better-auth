import { readFile, writeFile } from "node:fs/promises";
import type { migrateFrom16 } from "better-auth/db/migration";
import * as z from "zod";

/** File name the guided 1.6 migration reads and writes its reviewed decisions from. */
export const MIGRATION_DECISIONS_FILE = "better-auth-migration.json";

export type ReleaseMigrationOptions = Parameters<typeof migrateFrom16>[1];

const migrationDecisionsSchema = z.strictObject({
	formatVersion: z.literal(1),
	issuers: z.record(z.string().min(1), z.string().min(1)).optional(),
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
			consents: z.enum(["migrate", "reauthorize"]),
		})
		.optional(),
	scim: z
		.strictObject({
			retireAccountIds: z.array(z.string().min(1)),
		})
		.optional(),
});

/** Reviewed answers to the 1.6 release decisions a database cannot resolve on its own. */
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

/** Writes reviewed decisions as the artifact a later `--plan` run replays. */
export async function writeMigrationDecisions(
	filePath: string,
	decisions: MigrationDecisions,
): Promise<void> {
	await writeFile(filePath, `${JSON.stringify(decisions, null, 2)}\n`, "utf8");
}

/**
 * Expands reviewed decisions into release migration options. Token revocation,
 * client secret re-hashing, and SCIM reprovisioning have no alternative, so the
 * file records the decision that reaches them rather than the value itself.
 */
export function toReleaseMigrationOptions(
	decisions: MigrationDecisions | undefined,
): ReleaseMigrationOptions {
	return {
		accountIssuers: decisions?.issuers,
		legacyTableNames: decisions?.legacyTableNames,
		oauthProvider: decisions?.oauth && {
			clients: "migrate",
			clientSecrets: "rehash-plaintext",
			consents: decisions.oauth.consents,
			tokens: "revoke",
		},
		scim: decisions?.scim && {
			accountIdsToRetire: decisions.scim.retireAccountIds,
			providers: "reprovision",
		},
	};
}
