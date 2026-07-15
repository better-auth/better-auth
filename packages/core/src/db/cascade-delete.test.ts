import { describe, expect, it } from "vitest";
import { getDirectCascadeDeleteReferences } from "./cascade-delete";
import type { BetterAuthDBSchema } from "./type";

describe("getDirectCascadeDeleteReferences", () => {
	it("finds default and explicit cascades through logical and configured model names", () => {
		const schema = {
			account: {
				modelName: "providerCredential",
				fields: {},
			},
			walletAddress: {
				modelName: "walletAddress",
				fields: {
					accountId: {
						type: "string",
						references: { model: "account", field: "id" },
					},
				},
			},
			deviceCredential: {
				modelName: "deviceCredential",
				fields: {
					credentialId: {
						type: "string",
						references: {
							model: "providerCredential",
							field: "id",
							onDelete: "cascade",
						},
					},
				},
			},
		} satisfies BetterAuthDBSchema;

		expect(getDirectCascadeDeleteReferences(schema, "account")).toEqual([
			{
				model: "walletAddress",
				field: "accountId",
				referencedField: "id",
			},
			{
				model: "deviceCredential",
				field: "credentialId",
				referencedField: "id",
			},
		]);
	});

	it("excludes references that preserve or restrict child records", () => {
		const schema = {
			account: { modelName: "account", fields: {} },
			auditEvent: {
				modelName: "auditEvent",
				fields: {
					accountId: {
						type: "string",
						references: {
							model: "account",
							field: "id",
							onDelete: "set null",
						},
					},
				},
			},
		} satisfies BetterAuthDBSchema;

		expect(getDirectCascadeDeleteReferences(schema, "account")).toEqual([]);
	});
});
