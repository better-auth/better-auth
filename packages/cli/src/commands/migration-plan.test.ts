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
				totalAccounts: 4,
				externalAccounts: 3,
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
					'Set account.identityStrategy to "issuer" so runtime behavior matches the migrated database, then run the plan again.',
			},
		});
	});

	it("prints issuer readiness and manual-review providers before applying", () => {
		const plan = createMigrationPlan({
			accountIdentity: {
				selectedStrategy: "issuer",
				detectedStrategy: "provider-id",
				migrationRequired: true,
				totalAccounts: 17,
				externalAccounts: 3,
				automaticIssuerResolution: { resolved: 2, total: 3 },
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
				"Account identity: issuer (database: provider-id)",
			);
			expect(output).toContain("Automatic issuer resolution: 2/3");
			expect(output).toContain("Projected collisions: 1");
			expect(output).toContain(
				"Providers requiring manual issuer review: custom-oidc",
			);
			expect(output).toContain("No database changes were applied.");
		} finally {
			log.mockRestore();
		}
	});
});
