import { describe, expect, it, vi } from "vitest";
import { printHumanMigrationPlan } from "./migrate";
import { createMigrationPlan } from "./migration-plan";

describe("createMigrationPlan", () => {
	it("reports the configured account identity path and mismatch remediation", () => {
		const plan = createMigrationPlan({
			accountIdentity: {
				selectedStrategy: "provider-id",
				detectedStrategy: "issuer",
				migrationRequired: true,
				requiresRekey: true,
				totalAccounts: 1,
				externalAccounts: 1,
				automaticNamespaceResolution: { resolved: 1, total: 1 },
				projectedCollisions: 0,
				manualReviewProviders: [],
			},
			hasChanges: false,
			migrationBlockers: [
				{
					code: "account-identity-strategy-mismatch",
					configuredStrategy: "provider-id",
					detectedStrategy: "issuer",
					table: "account",
				},
			],
			migrationTarget: { adapter: "drizzle", dialect: "postgres" },
			toBeAdded: [],
			toBeAddedIndexes: [],
			toBeCreated: [],
		});

		expect(plan.status).toBe("blocked");
		expect(plan.accountIdentity.selectedStrategy).toBe("provider-id");
		expect(plan.blockers[0]).toMatchObject({
			code: "account-identity-strategy-mismatch",
			remediation: {
				summary:
					'Keep account.identityStrategy as "issuer", or perform a separate reviewed re-key migration before changing strategy.',
			},
		});
	});

	it("requires an explicit identity choice for populated 1.6 accounts", () => {
		const plan = createMigrationPlan({
			accountIdentity: {
				selectedStrategy: "issuer",
				detectedStrategy: "provider-id",
				migrationRequired: true,
				requiresRekey: false,
				totalAccounts: 3,
				externalAccounts: 2,
				automaticNamespaceResolution: { resolved: 2, total: 2 },
				projectedCollisions: 0,
				manualReviewProviders: [],
			},
			hasChanges: true,
			migrationBlockers: [],
			migrationTarget: { adapter: "drizzle", dialect: "postgres" },
			releaseMigrationBlockers: [
				{
					accountCount: 3,
					code: "account-identity-strategy-required",
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
			code: "account-identity-strategy-required",
			remediation: {
				summary:
					'Set account.identityStrategy to "provider-id" to preserve 1.6 account identity (recommended), or explicitly set it to "issuer" after reviewing projected collisions, then run the plan again.',
			},
		});
	});

	it("prints issuer namespace readiness and manual-review providers", () => {
		const plan = createMigrationPlan({
			accountIdentity: {
				selectedStrategy: "issuer",
				detectedStrategy: "provider-id",
				migrationRequired: true,
				requiresRekey: false,
				totalAccounts: 17,
				externalAccounts: 3,
				automaticNamespaceResolution: { resolved: 2, total: 3 },
				projectedCollisions: 1,
				manualReviewProviders: ["custom-oidc"],
			},
			hasChanges: true,
			migrationBlockers: [],
			migrationTarget: { adapter: "prisma", dialect: "postgres" },
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
			expect(output).toContain(
				"Account identity strategy: issuer (database: provider-id)",
			);
			expect(output).toContain("Automatic namespace resolution: 2/3");
			expect(output).toContain("Projected collisions: 1");
			expect(output).toContain(
				"Providers requiring manual issuer review: custom-oidc",
			);
			expect(output).not.toContain("Persisted namespace:");
			expect(output).toContain("No database changes were applied.");
		} finally {
			log.mockRestore();
		}
	});

	it("prints the deterministic provider namespace branch", () => {
		const plan = createMigrationPlan({
			accountIdentity: {
				selectedStrategy: "provider-id",
				detectedStrategy: "provider-id",
				migrationRequired: true,
				requiresRekey: false,
				totalAccounts: 4,
				externalAccounts: 3,
				automaticNamespaceResolution: { resolved: 3, total: 3 },
				projectedCollisions: 0,
				manualReviewProviders: [],
			},
			hasChanges: true,
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
			expect(output).toContain(
				"Account identity strategy: provider-id (database: provider-id)",
			);
			expect(output).toContain("Automatic namespace resolution: 3/3");
			expect(output).toContain("Projected collisions: 0");
			expect(output).toContain(
				"Persisted namespace: deterministic provider namespace",
			);
			expect(output).not.toContain("Providers requiring manual issuer review:");
		} finally {
			log.mockRestore();
		}
	});

	it("omits automatic namespace resolution when there are no external accounts", () => {
		const plan = createMigrationPlan({
			accountIdentity: {
				selectedStrategy: "issuer",
				detectedStrategy: "provider-id",
				migrationRequired: true,
				requiresRekey: false,
				totalAccounts: 2,
				externalAccounts: 0,
				automaticNamespaceResolution: { resolved: 0, total: 0 },
				projectedCollisions: 0,
				manualReviewProviders: [],
			},
			hasChanges: true,
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
			expect(output).not.toContain("Automatic namespace resolution:");
		} finally {
			log.mockRestore();
		}
	});
});
