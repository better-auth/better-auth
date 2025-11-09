import { describe, expect, it } from "vitest";
import { getAuthTables } from "./get-tables";

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

	it("should use custom ID field name for user table", () => {
		const tables = getAuthTables({
			user: {
				fields: {
					id: "user_id",
				},
			},
		});

		const userTable = tables.user;
		const idField = userTable!.fields.id!;

		expect(idField.fieldName).toBe("user_id");
		expect(idField.type).toBe("string");
		expect(idField.required).toBe(true);
	});

	it("should use default ID field name for user table when no custom name provided", () => {
		const tables = getAuthTables({});

		const userTable = tables.user;
		const idField = userTable!.fields.id!;

		expect(idField.fieldName).toBe("id");
		expect(idField.type).toBe("string");
		expect(idField.required).toBe(true);
	});

	it("should use custom ID field name for account table", () => {
		const tables = getAuthTables({
			account: {
				fields: {
					id: "account_id",
				},
			},
		});

		const accountTable = tables.account;
		const idField = accountTable!.fields.id!;

		expect(idField.fieldName).toBe("account_id");
		expect(idField.type).toBe("string");
		expect(idField.required).toBe(true);
	});

	it("should use default ID field name for account table when no custom name provided", () => {
		const tables = getAuthTables({});

		const accountTable = tables.account;
		const idField = accountTable!.fields.id!;

		expect(idField.fieldName).toBe("id");
		expect(idField.type).toBe("string");
		expect(idField.required).toBe(true);
	});

	it("should use custom ID field name for session table", () => {
		const tables = getAuthTables({
			session: {
				fields: {
					id: "session_id",
				},
			},
		});

		const sessionTable = tables.session;
		const idField = sessionTable!.fields.id!;

		expect(idField.fieldName).toBe("session_id");
		expect(idField.type).toBe("string");
		expect(idField.required).toBe(true);
	});

	it("should use default ID field name for session table when no custom name provided", () => {
		const tables = getAuthTables({});

		const sessionTable = tables.session;
		const idField = sessionTable!.fields.id!;

		expect(idField.fieldName).toBe("id");
		expect(idField.type).toBe("string");
		expect(idField.required).toBe(true);
	});

	it("should use custiom userId as foreign key in account and session table", () => {
		const tables = getAuthTables({
			user: {
				fields: {
					id: "user_id",
				},
			},
		});

		const accountTable = tables.account;
		const accountUserIdField = accountTable!.fields.userId!;

		expect(accountUserIdField.fieldName).toBe("userId");
		expect(accountUserIdField.type).toBe("string");
		expect(accountUserIdField.required).toBe(true);
		expect(accountUserIdField.references).toEqual({
			model: "user",
			field: "user_id",
			onDelete: "cascade",
		});

		const sessionTable = tables.session;
		const sessionUserIdField = sessionTable!.fields.userId!;

		expect(sessionUserIdField.fieldName).toBe("userId");
		expect(sessionUserIdField.type).toBe("string");
		expect(sessionUserIdField.required).toBe(true);
		expect(sessionUserIdField.references).toEqual({
			model: "user",
			field: "user_id",
			onDelete: "cascade",
		});
	});
});
