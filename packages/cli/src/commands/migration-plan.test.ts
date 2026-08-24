import { describe, expect, it } from "vitest";
import { createMigrationPlan } from "./migration-plan";

describe("createMigrationPlan", () => {
	it("reports the configured account identity path and mismatch remediation", () => {
		const plan = createMigrationPlan({
			accountIdentity: {
				selectedStrategy: "provider-id",
				detectedStrategy: "issuer",
				migrationRequired: true,
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
});
