import { describe, expect, it, vi } from "vitest";
import { printHumanMigrationPlan } from "./migrate";
import { createMigrationPlan } from "./migration-plan";

describe("createMigrationPlan", () => {
	it("reports the configured account identity path and mismatch remediation", () => {
		const plan = createMigrationPlan({
			accountIdentity: {
				effectiveScope: "provider",
				storedScope: "issuer",
				hasMixedIdentityNamespaces: false,
				migrationRequired: true,
				requiresRekey: true,
			},
			hasChanges: false,
			migrationBlockers: [
				{
					accountCount: 3,
					affectedProviders: ["google"],
					code: "account-identity-scope-mismatch",
					configuredScope: "provider",
					storedScope: "issuer",
					hasMixedIdentityNamespaces: false,
					malformedNamespaces: 0,
					table: "account",
				},
			],
			migrationTarget: { adapter: "drizzle", dialect: "postgres" },
			toBeAdded: [],
			toBeAddedIndexes: [],
			toBeCreated: [],
		});

		expect(plan.status).toBe("blocked");
		expect(plan.accountIdentity.effectiveScope).toBe("provider");
		expect(plan.blockers[0]).toMatchObject({
			code: "account-identity-scope-mismatch",
			remediation: {
				summary:
					'Keep account.identityScope as "issuer", or perform a separate reviewed re-key migration before changing scope.',
			},
		});
	});

	it.each([
		[
			"mixed account identities",
			true,
			0,
			"Resolve the mixed account identities with a separately reviewed re-key migration, then run the plan again.",
		],
		[
			"an incomplete mixed identity layout",
			false,
			0,
			"Resolve the mixed account identities with a separately reviewed re-key migration, then run the plan again.",
		],
		[
			"mixed account identities with malformed namespaces",
			true,
			1,
			'Repair every malformed namespace in "account", then resolve the remaining mixed account identities with a separately reviewed re-key migration.',
		],
	] as const)("reports complete remediation for %s", (_, hasMixedIdentityNamespaces, malformedNamespaces, expectedSummary) => {
		const plan = createMigrationPlan({
			accountIdentity: {
				effectiveScope: "issuer",
				storedScope: "mixed",
				hasMixedIdentityNamespaces,
				migrationRequired: true,
				requiresRekey: true,
			},
			hasChanges: false,
			migrationBlockers: [
				{
					accountCount: 3,
					affectedProviders: ["github", "google"],
					code: "account-identity-scope-mismatch",
					configuredScope: "issuer",
					storedScope: "mixed",
					hasMixedIdentityNamespaces,
					malformedNamespaces,
					table: "account",
				},
			],
			migrationTarget: { adapter: "drizzle", dialect: "postgres" },
			toBeAdded: [],
			toBeAddedIndexes: [],
			toBeCreated: [],
		});

		expect(plan.blockers[0]).toMatchObject({
			code: "account-identity-scope-mismatch",
			remediation: {
				summary: expectedSummary,
			},
		});
	});

	it("requires an explicit identity choice for populated 1.6 accounts", () => {
		const plan = createMigrationPlan({
			accountIdentity: {
				effectiveScope: "issuer",
				storedScope: "provider",
				hasMixedIdentityNamespaces: false,
				migrationRequired: true,
				requiresRekey: false,
			},
			hasChanges: true,
			migrationBlockers: [],
			migrationTarget: { adapter: "drizzle", dialect: "postgres" },
			releaseMigrationBlockers: [
				{
					accountCount: 3,
					code: "account-identity-scope-required",
					providerIds: ["credential", "github", "google"],
					table: "account",
				},
			],
			toBeAdded: [],
			toBeAddedIndexes: [],
			toBeCreated: [],
		});

		expect(plan.status).toBe("blocked");
		expect(plan.blockers[0]).toMatchObject({
			code: "account-identity-scope-required",
			remediation: {
				summary:
					'Set account: { identityScope: "provider" } to preserve 1.6 account identity, then run the plan again.',
			},
		});
	});

	it("names providers in collision remediation", () => {
		const plan = createMigrationPlan({
			accountIdentity: {
				effectiveScope: "provider",
				storedScope: "provider",
				hasMixedIdentityNamespaces: false,
				migrationRequired: true,
				requiresRekey: false,
			},
			hasChanges: true,
			migrationBlockers: [],
			migrationTarget: { adapter: "drizzle", dialect: "postgres" },
			releaseMigrationBlockers: [
				{
					code: "account-identity-collision",
					issuer: "local:oauth:google",
					providerAccountId: "108451",
					providerIds: ["google"],
					table: "account",
				},
			],
			toBeAdded: [],
			toBeAddedIndexes: [],
			toBeCreated: [],
		});

		expect(plan.blockers[0]).toMatchObject({
			code: "account-identity-collision",
			providerIds: ["google"],
			remediation: {
				summary: expect.stringContaining('providers "google"'),
			},
		});
	});

	it("reports account readiness counts and compatibility warnings", () => {
		const plan = createMigrationPlan({
			accountIdentity: {
				effectiveScope: "issuer",
				storedScope: "issuer",
				hasMixedIdentityNamespaces: false,
				migrationRequired: false,
				requiresRekey: false,
				totalAccounts: 4,
				externalAccounts: 3,
				automaticNamespaceResolution: { resolved: 3, total: 3 },
				projectedCollisions: 0,
				compatibilityWarning: "compatibility recommendation",
			},
			hasChanges: false,
			migrationBlockers: [],
			migrationTarget: { adapter: "drizzle", dialect: "sqlite" },
			toBeAdded: [],
			toBeAddedIndexes: [],
			toBeCreated: [],
		});
		const log = vi.spyOn(console, "log").mockImplementation(() => {});

		try {
			printHumanMigrationPlan(plan, [], [], []);
			const output = log.mock.calls
				.map((parts) => parts.map(String).join(" "))
				.join("\n");
			expect(output).toContain("Account identity scope: issuer");
			expect(output).toContain("Accounts: 4 total, 3 external");
			expect(output).toContain("Automatic namespace resolution: 3/3");
			expect(output).toContain("Projected collisions: 0");
			expect(output).toContain("Warning: compatibility recommendation");
		} finally {
			log.mockRestore();
		}
	});
});
