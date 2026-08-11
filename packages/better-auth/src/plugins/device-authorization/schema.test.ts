import type { DBFieldAttribute } from "@better-auth/core/db";
import { getAuthTables } from "@better-auth/core/db";
import { describe, expect, it } from "vitest";
import * as z from "zod";
import type { DeviceAuthorizationGrant } from ".";
import { deviceAuthorization } from ".";
import { schema } from "./schema";

function schemaGrant(
	deviceCodeSchemaFields: Record<string, DBFieldAttribute>,
): DeviceAuthorizationGrant {
	return {
		requestSchemaFields: {},
		deviceCodeSchemaFields,
		authorizeRequest: () => undefined,
		assertSessionRedemption: () => undefined,
		getVerificationContext: () => undefined,
	};
}

describe("device authorization schema", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/10025
	 */
	it("indexes device authorization lookup fields", () => {
		expect(schema.deviceCode.indexes).toEqual([
			{ fields: ["deviceCode"] },
			{ fields: ["userCode"] },
		]);
	});

	it("does not add OAuth resource fields to standalone installations", () => {
		const plugin = deviceAuthorization();
		const tables = getAuthTables({ plugins: [plugin] });

		expect(tables.deviceCode?.fields).not.toHaveProperty("resource");
		expect(tables.deviceCode?.fields).not.toHaveProperty("resources");
		expect(tables.deviceCode?.fields).not.toHaveProperty("oauthClientId");
		expect(
			plugin.endpoints.deviceCode.options.error.safeParse({
				error: "invalid_target",
				error_description: "OAuth-only error",
			}).success,
		).toBe(false);
	});

	it("rejects grant fields that redefine the base device-code schema", () => {
		expect(() =>
			deviceAuthorization({
				grant: schemaGrant({
					status: { type: "string", required: false },
					clientId: { type: "string", required: true },
				}),
			}),
		).toThrow(
			"Device authorization grant fields must be additional and cannot redefine deviceCode fields: status, clientId",
		);
	});

	it("rejects grant fields that redefine request or verification contracts", () => {
		expect(() =>
			deviceAuthorization({
				grant: {
					...schemaGrant({}),
					requestSchemaFields: { scope: z.string() },
				},
			}),
		).toThrow(
			"Device authorization grant request fields must be additional and cannot redefine request fields: scope",
		);

		expect(() =>
			deviceAuthorization({
				grant: {
					...schemaGrant({}),
					verificationOpenAPIProperties: { status: { type: "string" } },
				},
			}),
		).toThrow(
			"Device authorization grant verification fields must be additional and cannot redefine response fields: status",
		);
	});

	it("preserves grant array fields in the portable logical schema", () => {
		const plugin = deviceAuthorization({
			grant: schemaGrant({
				resources: { type: "string[]", required: false },
				oauthClientId: { type: "string", required: false },
			}),
		});
		const tables = getAuthTables({ plugins: [plugin] });

		expect(tables.deviceCode?.fields.resources).toMatchObject({
			type: "string[]",
			required: false,
		});
		expect(tables.deviceCode?.fields.oauthClientId).toMatchObject({
			type: "string",
			required: false,
		});
	});
});
