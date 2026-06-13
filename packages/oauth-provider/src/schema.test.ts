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

	it("defers DPoP/mTLS/JWE/opaque-token columns to follow-up PRs", () => {
		// Reserving columns without enforcement was rejected as security theater
		// (see RFC §"Suggested rollout"). Each deferred column lands alongside
		// its enforcement code in the relevant follow-up PR. This test guards
		// against an accidental re-introduction in this PR's scope.
		const oauthSchema = schema as Record<
			string,
			{ fields: Record<string, unknown> }
		>;
		const resourceFields = oauthSchema.oauthResource?.fields ?? {};
		const refreshFields = oauthSchema.oauthRefreshToken?.fields ?? {};

		const deferredOnResource = [
			"tokenFormat",
			"encryptionAlgorithm",
			"encryptionKeyId",
			"requireDpop",
			"requireMtls",
		];
		for (const fieldName of deferredOnResource) {
			expect(resourceFields[fieldName]).toBeUndefined();
		}
		expect(refreshFields.senderConstraintType).toBeUndefined();
		expect(refreshFields.senderConstraintKey).toBeUndefined();
	});
});
