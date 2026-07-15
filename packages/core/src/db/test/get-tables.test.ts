import { describe, expect, it } from "vitest";
import { getAuthTables } from "../get-tables";
import { accountSchema } from "../schema/account";
import type { IdentityKey } from "../schema/identity";
import { createLocalIdentityIssuer, identitySchema } from "../schema/identity";
import type { SecondaryStorage } from "../type";

const secondaryStorageStub: SecondaryStorage = {
	get: async () => null,
	getAndDelete: async () => null,
	increment: async () => 1,
	set: async () => {},
	delete: async () => {},
};

describe("getAuthTables", () => {
	it("creates a local identity key without changing the provider account id", () => {
		const credentialIdentityKey: IdentityKey = {
			issuer: createLocalIdentityIssuer("credential"),
			providerAccountId: "user-id",
		};

		expect(credentialIdentityKey).toEqual({
			issuer: "local:credential",
			providerAccountId: "user-id",
		});
	});

	it("escapes provider IDs in synthetic identity issuers", () => {
		expect(createLocalIdentityIssuer("credential")).toBe("local:credential");
		expect(createLocalIdentityIssuer("oauth:google")).toBe(
			"local:oauth%3Agoogle",
		);
		expect(createLocalIdentityIssuer("team/google%prod")).toBe(
			"local:team%2Fgoogle%25prod",
		);
	});

	it("parses identities and provider accounts as separate records", () => {
		const identity = identitySchema.parse({
			id: "identity-id",
			userId: "user-id",
			issuer: "https://identity.example.com",
			providerAccountId: "employee-1",
		});
		const account = accountSchema.parse({
			id: "account-id",
			identityId: identity.id,
			providerId: "workforce-production",
			providerInstanceId: "sso:provider:workforce-production",
		});

		expect(identity).toMatchObject({
			userId: "user-id",
			issuer: "https://identity.example.com",
			providerAccountId: "employee-1",
		});
		expect(account).toMatchObject({
			identityId: "identity-id",
			providerId: "workforce-production",
			providerInstanceId: "sso:provider:workforce-production",
		});
		expect(account).not.toHaveProperty("userId");
		expect(account).not.toHaveProperty("issuer");
		expect(account).not.toHaveProperty("providerAccountId");
	});

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

	it("separates stable identities from provider accounts", () => {
		const tables = getAuthTables({
			identity: {
				modelName: "externalIdentity",
				fields: {
					issuer: "identity_issuer",
					providerAccountId: "provider_subject",
					userId: "user_id",
				},
			},
			account: {
				fields: {
					identityId: "identity_id",
					providerId: "provider_alias",
					providerInstanceId: "provider_instance_id",
				},
			},
		});

		expect(tables.identity?.fields.issuer?.fieldName).toBe("identity_issuer");
		expect(tables.identity?.fields.providerAccountId?.fieldName).toBe(
			"provider_subject",
		);
		expect(tables.session?.fields.userId).toMatchObject({
			references: { field: "id", model: "user", onDelete: "restrict" },
		});
		expect(tables.identity?.fields.userId).toMatchObject({
			fieldName: "user_id",
			index: true,
			references: { field: "id", model: "user", onDelete: "restrict" },
		});
		expect(tables.identity?.indexes).toContainEqual({
			fields: ["issuer", "providerAccountId"],
			unique: true,
		});

		expect(tables.account?.fields.identityId).toMatchObject({
			fieldName: "identity_id",
			references: {
				field: "id",
				model: "externalIdentity",
				onDelete: "restrict",
			},
		});
		expect(tables.account?.fields.identityId?.index).toBeUndefined();
		expect(tables.account?.fields.providerId?.fieldName).toBe("provider_alias");
		expect(tables.account?.fields.providerInstanceId).toMatchObject({
			fieldName: "provider_instance_id",
			required: true,
			returned: false,
		});
		expect(tables.account?.fields.userId).toBeUndefined();
		expect(tables.account?.fields.issuer).toBeUndefined();
		expect(tables.account?.fields.providerAccountId).toBeUndefined();
		expect(tables.account?.indexes).toContainEqual({
			fields: ["identityId", "providerInstanceId"],
			unique: true,
		});
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
						identity: {
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

		expect(tables.identity?.indexes).toEqual([
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
