import type { BetterAuthOptions } from "@better-auth/core";
import {
	getExpectedSchema,
	SchemaMismatchError,
	schemaCheckFor,
} from "@better-auth/core/db/internal";
import { describe, expect, it, vi } from "vitest";
import { prismaAdapter } from "./prisma-adapter";
import type { PrismaRuntimeDataModel } from "./schema-check";
import { findPrismaSchemaProblems } from "./schema-check";

type Field = PrismaRuntimeDataModel["models"][string]["fields"][number];

const scalar = (name: string, isRequired = true): Field => ({
	name,
	kind: "scalar",
	isRequired,
	hasDefaultValue: false,
});

/**
 * Every model this configuration writes, declared the way `auth generate` would.
 */
function dataModelFor(options: BetterAuthOptions): PrismaRuntimeDataModel {
	const models: PrismaRuntimeDataModel["models"] = {};
	for (const [name, table] of Object.entries(getExpectedSchema(options))) {
		const model = name.charAt(0).toUpperCase() + name.slice(1);
		models[model] = {
			fields: [
				scalar("id"),
				...Object.entries(table.fields).map(([field, attribute]) =>
					scalar(field, attribute.required !== false),
				),
			],
		};
	}
	return { models };
}

/**
 * The generated data model with extra fields on the account model.
 */
function withAccountFields(...extra: Field[]): PrismaRuntimeDataModel {
	const { models } = dataModelFor({});
	const account = models.Account!;
	return {
		models: { ...models, Account: { fields: [...account.fields, ...extra] } },
	};
}

describe("findPrismaSchemaProblems", () => {
	it("accepts a data model generated for this configuration", () => {
		expect(findPrismaSchemaProblems(dataModelFor({}), {})).toEqual([]);
	});

	it("reports a model the client does not expose", () => {
		const { Account: _account, ...models } = dataModelFor({}).models;
		expect(findPrismaSchemaProblems({ models }, {})).toEqual([
			{ kind: "missing-table", table: "account" },
		]);
	});

	it("skips relation fields and fields Prisma fills itself", () => {
		const dataModel = withAccountFields(
			{
				name: "user",
				kind: "object",
				isRequired: true,
				hasDefaultValue: false,
			},
			{ ...scalar("touchedAt"), isUpdatedAt: true },
			{ ...scalar("rank"), hasDefaultValue: true },
		);
		expect(findPrismaSchemaProblems(dataModel, {})).toEqual([]);
	});

	it("reports a required field the adapter never fills", () => {
		const dataModel = withAccountFields(
			scalar("issuer"),
			scalar("note", false),
		);
		expect(findPrismaSchemaProblems(dataModel, {})).toEqual([
			{
				kind: "unexpected-required-column",
				table: "account",
				column: "issuer",
			},
		]);
	});
});

describe("findPrismaSchemaProblems with the compact data model", () => {
	/**
	 * The shape the `prisma-client` generator emits: names and kinds only.
	 */
	function compact(dataModel: PrismaRuntimeDataModel): PrismaRuntimeDataModel {
		return {
			models: Object.fromEntries(
				Object.entries(dataModel.models).map(([model, { fields }]) => [
					model,
					{ fields: fields.map(({ name, kind }) => ({ name, kind })) },
				]),
			),
		};
	}

	it("still reports a model or field the client does not expose", () => {
		const { Account: _account, ...models } = compact(dataModelFor({})).models;
		expect(findPrismaSchemaProblems({ models }, {})).toEqual([
			{ kind: "missing-table", table: "account" },
		]);
	});

	it("cannot tell a required field apart and stays silent about it", () => {
		const dataModel = compact(withAccountFields(scalar("issuer")));
		expect(findPrismaSchemaProblems(dataModel, {})).toEqual([]);
	});
});

describe("prismaAdapter", () => {
	const adapterFor = (client: object, options: BetterAuthOptions = {}) =>
		prismaAdapter({ $transaction: vi.fn(), ...client } as never, {
			provider: "postgresql",
		})(options);

	it("registers a check the first request awaits", async () => {
		await expect(
			schemaCheckFor(adapterFor({ _runtimeDataModel: dataModelFor({}) }))?.(),
		).resolves.toBeUndefined();

		const { Account: _account, ...models } = dataModelFor({}).models;
		await expect(
			schemaCheckFor(adapterFor({ _runtimeDataModel: { models } }))?.(),
		).rejects.toThrow(SchemaMismatchError);
	});

	it("registers nothing without a data model or when disabled", () => {
		expect(schemaCheckFor(adapterFor({}))).toBeUndefined();
		expect(
			schemaCheckFor(
				adapterFor(
					{ _runtimeDataModel: dataModelFor({}) },
					{ advanced: { database: { validateSchema: false } } },
				),
			),
		).toBeUndefined();
	});
});
