import { expect, it } from "vitest";
import { linear } from "./linear";

/** @see https://linear.app/developers/oauth-2-0-authentication */
it("joins authorization scopes with commas", async () => {
	const provider = linear({ clientId: "app", scope: ["write"] });
	const url = await provider.createAuthorizationURL({
		state: "state",
		redirectURI: "https://example.com/callback",
		codeVerifier: "",
		scopes: ["comments:create"],
	});
	expect(url.searchParams.get("scope")).toBe("read,write,comments:create");
	const custom = await linear({
		clientId: "app",
		disableDefaultScope: true,
		scope: ["write", "comments:create"],
	}).createAuthorizationURL({
		state: "state",
		redirectURI: "https://example.com/callback",
		codeVerifier: "",
	});
	expect(custom.searchParams.get("scope")).toBe("write,comments:create");
});
