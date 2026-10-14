import { describe, expect, it } from "vitest";
import { assertOIDCAuthorizedParty } from "./discovery";

describe("OIDC authorized party validation", () => {
	it("accepts the configured client as azp for a multi-audience token", () => {
		expect(() =>
			assertOIDCAuthorizedParty(
				{ aud: ["workforce-client", "api"], azp: "workforce-client" },
				"workforce-client",
			),
		).not.toThrow();
	});

	it.each([
		[{ aud: ["workforce-client", "api"] }, "missing azp"],
		[
			{ aud: ["workforce-client", "api"], azp: "another-client" },
			"incorrect azp",
		],
		[{ aud: "workforce-client", azp: "another-client" }, "incorrect azp"],
	])("rejects %s (%s)", (payload: {
		aud: string | string[];
		azp?: string;
	}, _label) => {
		expect(() =>
			assertOIDCAuthorizedParty(payload, "workforce-client"),
		).toThrow("OIDC ID token authorized party does not match the client");
	});
});
