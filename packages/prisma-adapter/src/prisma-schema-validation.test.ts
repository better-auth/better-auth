import type { BetterAuthOptions } from "@better-auth/core";
import { SchemaMismatchError } from "@better-auth/core/db/internal";
import { describe, expect, it, vi } from "vitest";
import { prismaAdapter } from "./prisma-adapter";

type Field = {
	name: string;
	kind?: string;
	isRequired?: boolean;
	isList?: boolean;
	isId?: boolean;
	hasDefaultValue?: boolean;
	isUpdatedAt?: boolean;
	isGenerated?: boolean;
};

const id: Field = { name: "id", kind: "scalar", isRequired: true, isId: true };
const required = (name: string): Field => ({
	name,
	kind: "scalar",
	isRequired: true,
});
const optional = (name: string): Field => ({
	name,
	kind: "scalar",
	isRequired: false,
});
const createdAt: Field = {
	name: "createdAt",
	kind: "scalar",
	isRequired: true,
	hasDefaultValue: true,
};
const updatedAt: Field = {
	name: "updatedAt",
	kind: "scalar",
	isRequired: true,
	isUpdatedAt: true,
};
const relation = (name: string): Field => ({
	name,
	kind: "object",
	isRequired: true,
});

const models = () => ({
	User: {
		fields: [
			id,
			required("name"),
			required("email"),
			{ ...required("emailVerified"), hasDefaultValue: true },
			optional("image"),
			createdAt,
			updatedAt,
			{ ...relation("sessions"), isList: true },
			{ ...relation("accounts"), isList: true },
		],
	},
	Session: {
		fields: [
			id,
			required("expiresAt"),
			required("token"),
			createdAt,
			updatedAt,
			optional("ipAddress"),
			optional("userAgent"),
			required("userId"),
			relation("user"),
		],
	},
	Account: {
		fields: [
			id,
			required("accountId"),
			required("providerId"),
			required("userId"),
			optional("accessToken"),
			optional("refreshToken"),
			optional("idToken"),
			optional("accessTokenExpiresAt"),
			optional("refreshTokenExpiresAt"),
			optional("scope"),
			optional("password"),
			createdAt,
			updatedAt,
			relation("user"),
		],
	},
	Verification: {
		fields: [
			id,
			required("identifier"),
			required("value"),
			required("expiresAt"),
			createdAt,
			updatedAt,
		],
	},
});

const create = (
	runtimeDataModel: { models: Record<string, { fields: Field[] }> } | undefined,
	options: BetterAuthOptions = {},
) =>
	prismaAdapter(
		{ $transaction: vi.fn(), _runtimeDataModel: runtimeDataModel } as never,
		{ provider: "postgresql" },
	)(options);

describe("prisma schema validation", () => {
	it("accepts a Prisma client whose models match the schema", () => {
		expect(() => create({ models: models() })).not.toThrow();
	});

	it("reports a field missing from a Prisma model", () => {
		const m = models();
		m.Account.fields = m.Account.fields.filter((f) => f.name !== "scope");
		let error: unknown;
		try {
			create({ models: m });
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(SchemaMismatchError);
		const message = (error as SchemaMismatchError).message;
		expect(message).toContain('Column "scope" is missing from table "Account"');
		expect(message).toContain("npx auth generate");
	});

	it("reports a required field Better Auth never writes", () => {
		const m = models();
		m.Account.fields.push(required("issuer"));
		let error: unknown;
		try {
			create({ models: m });
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(SchemaMismatchError);
		const message = (error as SchemaMismatchError).message;
		expect(message).toContain('Column "issuer" on table "Account" is required');
		expect(message).toContain("account_issuer_accountId_uidx");
	});

	it("allows extra fields that an insert can omit", () => {
		const m = models();
		m.Account.fields.push(
			{ ...required("tenant"), hasDefaultValue: true },
			optional("note"),
			relation("organization"),
			{ ...required("tags"), isList: true },
		);
		expect(() => create({ models: m })).not.toThrow();
	});

	it("reports a missing model", () => {
		const m = models();
		const { Verification: _verification, ...rest } = m;
		expect(() => create({ models: rest })).toThrow(
			'Table "verification" is missing',
		);
	});

	it("can be disabled with advanced.database.validateSchema", () => {
		const m = models();
		m.Account.fields.push(required("issuer"));
		expect(() =>
			create(
				{ models: m },
				{ advanced: { database: { validateSchema: false } } },
			),
		).not.toThrow();
	});

	it("skips clients without runtime model metadata", () => {
		expect(() => create(undefined)).not.toThrow();
	});
});
