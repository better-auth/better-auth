import { describe, expect, it } from "vitest";
import { getAuthTables } from "../get-tables";

describe("getAuthTables", () => {
	it("should use correct field name for refreshTokenExpiresAt", () => {
		const tables = getAuthTables({
			account: {
				fields: {
					refreshTokenExpiresAt: "custom_refresh_token_expires_at",
				},
			},
		});

		const accountTable = tables.account;
		const refreshTokenExpiresAtField =
			accountTable!.fields.refreshTokenExpiresAt!;

		expect(refreshTokenExpiresAtField.fieldName).toBe(
			"custom_refresh_token_expires_at",
		);
	});

	it("should not use accessTokenExpiresAt field name for refreshTokenExpiresAt", () => {
		const tables = getAuthTables({
			account: {
				fields: {
					accessTokenExpiresAt: "custom_access_token_expires_at",
					refreshTokenExpiresAt: "custom_refresh_token_expires_at",
				},
			},
		});

		const accountTable = tables.account;
		const refreshTokenExpiresAtField =
			accountTable!.fields.refreshTokenExpiresAt!;
		const accessTokenExpiresAtField =
			accountTable!.fields.accessTokenExpiresAt!;

		expect(refreshTokenExpiresAtField.fieldName).toBe(
			"custom_refresh_token_expires_at",
		);
		expect(accessTokenExpiresAtField.fieldName).toBe(
			"custom_access_token_expires_at",
		);
		expect(refreshTokenExpiresAtField.fieldName).not.toBe(
			accessTokenExpiresAtField.fieldName,
		);
	});

	it("should use default field names when no custom names provided", () => {
		const tables = getAuthTables({});

		const accountTable = tables.account;
		const refreshTokenExpiresAtField =
			accountTable!.fields.refreshTokenExpiresAt!;
		const accessTokenExpiresAtField =
			accountTable!.fields.accessTokenExpiresAt!;

		expect(refreshTokenExpiresAtField.fieldName).toBe("refreshTokenExpiresAt");
		expect(accessTokenExpiresAtField.fieldName).toBe("accessTokenExpiresAt");
	});

	it("should merge additionalFields into verification table metadata", () => {
		const tables = getAuthTables({
			verification: {
				additionalFields: {
					newField: {
						fieldName: "new_field",
						type: "string",
					},
				},
			},
		});

		const verificationTable = tables.verification;
		const newField = verificationTable!.fields.newField!;

		console.log(newField);
		expect(newField).not.toBeUndefined();
		expect(newField.fieldName).toBe("new_field");
		expect(newField.type).toBe("string");
	});

	it("should exclude verification table when secondaryStorage is configured", () => {
		const tables = getAuthTables({
			secondaryStorage: {
				get: async () => null,
				set: async () => {},
				delete: async () => {},
			},
		});

		expect(tables.verification).toBeUndefined();
	});

	it("should include verification table when storeInDatabase is true", () => {
		const tables = getAuthTables({
			secondaryStorage: {
				get: async () => null,
				set: async () => {},
				delete: async () => {},
			},
			verification: {
				storeInDatabase: true,
			},
		});

		expect(tables.verification).toBeDefined();
	});

	it("should include verification table when no secondaryStorage", () => {
		const tables = getAuthTables({});

		expect(tables.verification).toBeDefined();
	});

	describe("signInAttempt schema gate via plugin.signInChallenges", () => {
		it("activates signInAttempt when any plugin declares signInChallenges", () => {
			const tables = getAuthTables({
				plugins: [
					{
						id: "fixture-challenge",
						signInChallenges: ["fixture"] as const,
					},
				],
			});
			expect(tables.signInAttempt).toBeDefined();
		});

		it("keeps signInAttempt absent when no plugin declares signInChallenges", () => {
			const tables = getAuthTables({
				plugins: [{ id: "fixture-plain" }],
			});
			expect(tables.signInAttempt).toBeUndefined();
		});

		it("keeps signInAttempt absent when a plugin declares empty signInChallenges", () => {
			const tables = getAuthTables({
				plugins: [
					{
						id: "fixture-empty",
						signInChallenges: [] as const,
					},
				],
			});
			expect(tables.signInAttempt).toBeUndefined();
		});

		it("no longer hardcodes plugin.id === 'two-factor' (A1 gate correction)", () => {
			const tables = getAuthTables({
				plugins: [{ id: "two-factor" }],
			});
			expect(tables.signInAttempt).toBeUndefined();
		});

		it("drops the loginMethod column from signInAttempt (collapsed into session.amr)", () => {
			const tables = getAuthTables({
				plugins: [
					{
						id: "fixture-challenge",
						signInChallenges: ["fixture"] as const,
					},
				],
			});
			expect(tables.signInAttempt?.fields.loginMethod).toBeUndefined();
		});
	});

	describe("session.amr column", () => {
		it("adds session.amr as a json column with a [] default", () => {
			const tables = getAuthTables({});
			const amrField = tables.session?.fields.amr;
			expect(amrField).toBeDefined();
			expect(amrField?.type).toBe("json");
			expect(amrField?.required).toBe(true);
			const factory = amrField?.defaultValue as (() => unknown) | undefined;
			expect(factory?.()).toStrictEqual([]);
		});
	});
});
