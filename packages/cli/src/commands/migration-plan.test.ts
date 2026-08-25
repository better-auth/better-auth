import { describe, expect, it } from "vitest";
import { createMigrationPlan } from "./migration-plan";

describe("createMigrationPlan", () => {
	it("reports the configured account identity path and mismatch remediation", () => {
		const plan = createMigrationPlan({
			accountIdentity: {
				selectedStrategy: "provider-id",
				detectedStrategy: "issuer",
				migrationRequired: true,
				requiresRekey: true,
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
});
