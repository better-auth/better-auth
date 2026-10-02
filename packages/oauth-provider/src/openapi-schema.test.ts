import { describe, expect, it } from "vitest";
import { oauthProvider } from "./oauth";

/**
 * The OpenAPI metadata must document the response the endpoints actually
 * return (`{ redirect, url }`, see `OAuthRedirectResult`) — the generated
 * spec previously advertised a `redirect_uri` field that never appeared in
 * the response body.
 *
 * @see https://github.com/better-auth/better-auth/issues/10880
 */
describe("consent and continue OpenAPI response schema", () => {
	const plugin = oauthProvider({
		loginPage: "/login",
		consentPage: "/consent",
	});

	it.each([
		"oauth2Consent",
		"oauth2Continue",
	] as const)("%s documents the implemented { redirect, url } response body", (endpointName) => {
		const schema =
			plugin.endpoints[endpointName].options.metadata?.openapi?.responses?.[
				"200"
			]?.content?.["application/json"]?.schema;

		expect(Object.keys(schema?.properties ?? {}).sort()).toEqual([
			"redirect",
			"url",
		]);
		expect([...(schema?.required ?? [])].sort()).toEqual(["redirect", "url"]);
	});
});
