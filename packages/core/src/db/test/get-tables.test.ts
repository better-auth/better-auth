import { describe, expect, it } from "vitest";
import { getAuthTables } from "../get-tables";
import type { SecondaryStorage } from "../type";

const secondaryStorageStub: SecondaryStorage = {
	get: async () => null,
	getAndDelete: async () => null,
	increment: async () => 1,
	set: async () => {},
	delete: async () => {},
};

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

	it("should propagate compound indexes from plugin schemas", () => {
		const tables = getAuthTables({
			plugins: [
				{
					id: "directory",
					schema: {
						directoryUser: {
							fields: {
								connectionId: { type: "string" },
								externalId: { type: "string" },
							},
							indexes: [
								{
									fields: ["connectionId", "externalId"],
									unique: true,
								},
							],
						},
					},
				},
			],
		});

		expect(tables.directoryUser?.indexes).toEqual([
			{
				fields: ["connectionId", "externalId"],
				unique: true,
			},
		]);
	});

	it("should preserve compound indexes when a plugin extends a core table", () => {
		const tables = getAuthTables({
			plugins: [
				{
					id: "account-identity",
					schema: {
						account: {
							fields: {
								issuer: { type: "string" },
								providerAccountId: { type: "string" },
							},
							indexes: [
								{
									fields: ["issuer", "providerAccountId"],
									unique: true,
								},
							],
						},
					},
				},
			],
		});

		expect(tables.account?.indexes).toEqual([
			{
				fields: ["issuer", "providerAccountId"],
				unique: true,
			},
		]);
	});

	it("should reject multiple logical tables targeting one physical table", () => {
		expect(() =>
			getAuthTables({
				plugins: [
					{
						id: "ambiguous-schema",
						schema: {
							directorySubject: {
								modelName: "directory_identity",
								fields: { subject: { type: "string" } },
								indexes: [{ fields: ["subject"] }],
							},
							directoryIdentity: {
								modelName: "directory_identity",
								fields: { issuer: { type: "string" } },
							},
						},
					},
				],
			}),
		).toThrow(
			'Database schema resolves more than one indexed logical table to "directory_identity".',
		);
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
			secondaryStorage: secondaryStorageStub,
		});

		expect(tables.verification).toBeUndefined();
	});

	it("should include verification table when storeInDatabase is true", () => {
		const tables = getAuthTables({
			secondaryStorage: secondaryStorageStub,
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

	it("should propagate disableMigration from a plugin schema onto the table", () => {
		const tables = getAuthTables({
			plugins: [
				{
					id: "test",
					schema: {
						skipped: {
							fields: { name: { type: "string" } },
							disableMigration: true,
						},
						kept: {
							fields: { name: { type: "string" } },
						},
					},
				},
			],
		});

		expect(tables.skipped!.disableMigrations).toBe(true);
		expect(tables.kept!.disableMigrations).toBeUndefined();
	});

	it("should keep disableMigration when plugins accumulate the same table key", () => {
		const tables = getAuthTables({
			plugins: [
				{
					id: "a",
					schema: {
						shared: {
							fields: { a: { type: "string" } },
							disableMigration: true,
						},
					},
				},
				{
					id: "b",
					schema: {
						shared: {
							fields: { b: { type: "string" } },
						},
					},
				},
			],
		});

		expect(tables.shared!.disableMigrations).toBe(true);
	});

	it("should merge distinct indexes when plugins extend the same table", () => {
		const connectionIndex = {
			fields: ["connectionId", "externalId"],
			unique: true,
		} as const;
		const tables = getAuthTables({
			plugins: [
				{
					id: "a",
					schema: {
						shared: {
							fields: {
								connectionId: { type: "string" },
								externalId: { type: "string" },
							},
							indexes: [connectionIndex],
						},
					},
				},
				{
					id: "b",
					schema: {
						shared: {
							fields: { status: { type: "string" } },
							indexes: [
								connectionIndex,
								{ fields: ["connectionId", "status"] },
							],
						},
					},
				},
			],
		});

		expect(tables.shared?.indexes).toEqual([
			connectionIndex,
			{ fields: ["connectionId", "status"] },
		]);
	});
});
