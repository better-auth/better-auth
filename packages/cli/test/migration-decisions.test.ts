import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import type { MigrationDecisions } from "../src/commands/migration-decisions";
import {
	loadMigrationDecisions,
	writeMigrationDecisions,
} from "../src/commands/migration-decisions";

it("rejects decisions that do not identify the release migration", async () => {
	const directory = await fs.mkdtemp(
		path.join(os.tmpdir(), "better-auth-migration-decisions-"),
	);
	const filePath = path.join(directory, "better-auth-migration.json");
	await fs.writeFile(filePath, JSON.stringify({ formatVersion: 1 }), "utf8");

	try {
		await expect(loadMigrationDecisions(filePath)).rejects.toThrow("migration");
	} finally {
		await fs.rm(directory, { recursive: true });
	}
});

it("rejects decisions for a different release migration", async () => {
	const directory = await fs.mkdtemp(
		path.join(os.tmpdir(), "better-auth-migration-decisions-"),
	);
	const filePath = path.join(directory, "better-auth-migration.json");
	await fs.writeFile(
		filePath,
		JSON.stringify({ formatVersion: 1, migration: "1.7-to-1.8" }),
		"utf8",
	);

	try {
		await expect(loadMigrationDecisions(filePath)).rejects.toThrow("migration");
	} finally {
		await fs.rm(directory, { recursive: true });
	}
});

it("preserves an existing migration decisions file with different content", async () => {
	const directory = await fs.mkdtemp(
		path.join(os.tmpdir(), "better-auth-migration-decisions-"),
	);
	const filePath = path.join(directory, "better-auth-migration.json");
	const existing = `${JSON.stringify(
		{
			formatVersion: 1,
			legacyTableNames: { oauthConsent: "oauthConsent" },
			migration: "1.6-to-1.7",
		},
		null,
		2,
	)}\n`;
	await fs.writeFile(filePath, existing, "utf8");

	try {
		await expect(
			writeMigrationDecisions(filePath, {
				formatVersion: 1,
				legacyTableNames: { oauthConsent: "legacyOAuthConsent" },
				migration: "1.6-to-1.7",
			} satisfies MigrationDecisions),
		).rejects.toThrow(
			"already exists with different decisions and was not changed",
		);
		await expect(fs.readFile(filePath, "utf8")).resolves.toBe(existing);
	} finally {
		await fs.rm(directory, { recursive: true });
	}
});

it("reuses an identical migration decisions file", async () => {
	const directory = await fs.mkdtemp(
		path.join(os.tmpdir(), "better-auth-migration-decisions-"),
	);
	const filePath = path.join(directory, "better-auth-migration.json");
	const decisions = {
		formatVersion: 1,
		legacyTableNames: { oauthConsent: "oauthConsent" },
		migration: "1.6-to-1.7",
	} satisfies MigrationDecisions;

	try {
		await expect(writeMigrationDecisions(filePath, decisions)).resolves.toBe(
			"created",
		);
		await expect(writeMigrationDecisions(filePath, decisions)).resolves.toBe(
			"reused",
		);
	} finally {
		await fs.rm(directory, { recursive: true });
	}
});

it("allows only one of two different concurrent decisions to claim a path", async () => {
	const directory = await fs.mkdtemp(
		path.join(os.tmpdir(), "better-auth-migration-decisions-"),
	);
	const filePath = path.join(directory, "better-auth-migration.json");
	const left = {
		formatVersion: 1,
		legacyTableNames: { oauthConsent: "oauthConsent" },
		migration: "1.6-to-1.7",
	} satisfies MigrationDecisions;
	const right = {
		formatVersion: 1,
		legacyTableNames: { oauthConsent: "legacyOAuthConsent" },
		migration: "1.6-to-1.7",
	} satisfies MigrationDecisions;

	try {
		const results = await Promise.allSettled([
			writeMigrationDecisions(filePath, left),
			writeMigrationDecisions(filePath, right),
		]);
		expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
			1,
		);
		expect(results.filter(({ status }) => status === "rejected")).toHaveLength(
			1,
		);
		const saved = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
		expect([left, right]).toContainEqual(saved);
	} finally {
		await fs.rm(directory, { recursive: true });
	}
});
