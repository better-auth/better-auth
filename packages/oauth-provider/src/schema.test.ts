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
});
