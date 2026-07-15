import type {
	BetterAuthPluginDBSchema,
	DBPrimitive,
} from "@better-auth/core/db";
import { describe, expect, it } from "vitest";
import * as z from "zod";
import { mergeSchema } from "./schema";

describe("mergeSchema", () => {
	it("returns an independent schema without mutating either input", () => {
		const normalizeAccountId = (value: DBPrimitive) => value;
		const accountIdValidator = z.string();
		const baseSchema = {
			walletAddress: {
				modelName: "walletAddress",
				fields: {
					accountId: {
						type: "string",
						transform: { input: normalizeAccountId },
						validator: { input: accountIdValidator },
						references: {
							model: "account",
							field: "id",
							onDelete: "cascade",
						},
					},
				},
				indexes: [{ fields: ["accountId"], unique: true }],
			},
		} satisfies BetterAuthPluginDBSchema;
		const fieldMappings = {
			walletAddress: {
				modelName: "wallet_address",
				fields: { accountId: "account_id" },
			},
		};

		const mergedSchema = mergeSchema(baseSchema, fieldMappings);

		expect(mergedSchema).not.toBe(baseSchema);
		expect(mergedSchema.walletAddress).not.toBe(baseSchema.walletAddress);
		expect(mergedSchema.walletAddress?.fields).not.toBe(
			baseSchema.walletAddress?.fields,
		);
		expect(mergedSchema.walletAddress?.fields.accountId).not.toBe(
			baseSchema.walletAddress?.fields.accountId,
		);
		expect(mergedSchema.walletAddress?.fields.accountId?.references).not.toBe(
			baseSchema.walletAddress?.fields.accountId?.references,
		);
		expect(mergedSchema.walletAddress?.fields.accountId?.transform).not.toBe(
			baseSchema.walletAddress?.fields.accountId?.transform,
		);
		expect(mergedSchema.walletAddress?.fields.accountId?.transform?.input).toBe(
			normalizeAccountId,
		);
		expect(mergedSchema.walletAddress?.fields.accountId?.validator).not.toBe(
			baseSchema.walletAddress?.fields.accountId?.validator,
		);
		expect(mergedSchema.walletAddress?.fields.accountId?.validator?.input).toBe(
			accountIdValidator,
		);
		expect(mergedSchema.walletAddress?.indexes).not.toBe(
			baseSchema.walletAddress?.indexes,
		);
		expect(mergedSchema.walletAddress?.indexes?.[0]).not.toBe(
			baseSchema.walletAddress?.indexes?.[0],
		);
		expect(mergedSchema.walletAddress?.indexes?.[0]?.fields).not.toBe(
			baseSchema.walletAddress?.indexes?.[0]?.fields,
		);
		expect(mergedSchema.walletAddress).toMatchObject({
			modelName: "wallet_address",
			fields: { accountId: { fieldName: "account_id" } },
		});
		expect(baseSchema.walletAddress?.modelName).toBe("walletAddress");
		expect("fieldName" in baseSchema.walletAddress.fields.accountId).toBe(
			false,
		);
		expect(fieldMappings).toEqual({
			walletAddress: {
				modelName: "wallet_address",
				fields: { accountId: "account_id" },
			},
		});
	});

	it("returns an independent schema when no mappings are provided", () => {
		const baseSchema: BetterAuthPluginDBSchema = {
			user: {
				fields: {
					role: { type: "string" },
				},
			},
		};

		const mergedSchema = mergeSchema(baseSchema);

		expect(mergedSchema).not.toBe(baseSchema);
		expect(mergedSchema.user).not.toBe(baseSchema.user);
		expect(mergedSchema.user?.fields).not.toBe(baseSchema.user?.fields);
		expect(mergedSchema.user?.fields.role).not.toBe(
			baseSchema.user?.fields.role,
		);
	});
});
