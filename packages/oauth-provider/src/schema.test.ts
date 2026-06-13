import { describe, expect, it } from "vitest";
import { schema } from "./schema";

describe("oauth provider schema", () => {
	it("indexes OAuth foreign-key fields", () => {
		const indexedForeignKeys = [
			["oauthClient", "userId"],
			["oauthRefreshToken", "clientId"],
			["oauthRefreshToken", "sessionId"],
			["oauthRefreshToken", "userId"],
			["oauthAccessToken", "clientId"],
			["oauthAccessToken", "sessionId"],
			["oauthAccessToken", "userId"],
			["oauthAccessToken", "refreshId"],
			["oauthConsent", "clientId"],
			["oauthConsent", "userId"],
			["oauthClientResource", "clientId"],
			["oauthClientResource", "resourceId"],
		] as const;

		const oauthProviderSchema = schema as Record<
			string,
			{ fields: Record<string, { index?: boolean; references?: unknown }> }
		>;

		for (const [modelName, fieldName] of indexedForeignKeys) {
			const field = oauthProviderSchema[modelName]?.fields[fieldName];

			expect(field?.references).toBeDefined();
			expect(field?.index).toBe(true);
		}
	});

	it("declares the oauthResource entity with the expected policy seams", () => {
		type FieldShape = {
			type?: string;
			unique?: boolean;
			required?: boolean;
			defaultValue?: unknown;
		};
		const oauthSchema = schema as Record<
			string,
			{ fields: Record<string, FieldShape | undefined> }
		>;
		const resource = oauthSchema.oauthResource;
		if (!resource) {
			throw new Error("oauthResource table missing from schema");
		}
		const requireField = (name: string): FieldShape => {
			const field = resource.fields[name];
			if (!field) {
				throw new Error(`oauthResource.${name} missing from schema`);
			}
			return field;
		};

		// Business key — the RFC 8707 `resource` value
		expect(requireField("identifier").unique).toBe(true);
		expect(requireField("identifier").required).toBe(true);
		expect(requireField("name").required).toBe(true);

		// Nullable policy columns — null means "inherit plugin default at issuance"
		const nullablePolicy = [
			"accessTokenTtl",
			"refreshTokenTtl",
			"signingAlgorithm",
			"signingKeyId",
			"allowedScopes",
			"customClaims",
		];
		for (const fieldName of nullablePolicy) {
			expect(requireField(fieldName).required).not.toBe(true);
		}

		// Lifecycle + extensibility seams
		expect(requireField("disabled").defaultValue).toBe(false);
		expect(requireField("policyVersion").defaultValue).toBe(1);
		expect(resource.fields.metadata).toBeDefined();
	});

	it("declares DPoP sender-constraint storage with enforcement state", () => {
		const oauthSchema = schema as Record<
			string,
			{
				fields: Record<
					string,
					{
						type?: string;
						required?: boolean;
						unique?: boolean;
						defaultValue?: unknown;
					}
				>;
			}
		>;
		const clientFields = oauthSchema.oauthClient?.fields ?? {};
		const resourceFields = oauthSchema.oauthResource?.fields ?? {};
		const refreshFields = oauthSchema.oauthRefreshToken?.fields ?? {};
		const accessFields = oauthSchema.oauthAccessToken?.fields ?? {};
		const dpopProofFields = oauthSchema.oauthDpopProof?.fields ?? {};

		expect(clientFields.dpopBoundAccessTokens?.defaultValue).toBe(false);
		expect(resourceFields.dpopBoundAccessTokensRequired?.defaultValue).toBe(
			false,
		);
		expect(refreshFields.dpopJkt).toBeDefined();
		expect(accessFields.dpopJkt).toBeDefined();
		expect(dpopProofFields.replayId?.unique).toBe(true);
		expect(dpopProofFields.expiresAt?.required).toBe(true);
		expect(dpopProofFields.createdAt?.required).toBe(true);

		// Other sender-constraint/token-format families are still deferred until
		// they land with enforcement rather than inert schema surface.

		const deferredOnResource = [
			"tokenFormat",
			"encryptionAlgorithm",
			"encryptionKeyId",
			"requireMtls",
		];
		for (const fieldName of deferredOnResource) {
			expect(resourceFields[fieldName]).toBeUndefined();
		}
		expect(refreshFields.senderConstraintType).toBeUndefined();
		expect(refreshFields.senderConstraintKey).toBeUndefined();
	});
});
