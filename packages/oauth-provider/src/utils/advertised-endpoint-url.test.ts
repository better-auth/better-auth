import type { GenericEndpointContext } from "@better-auth/core";
import { describe, expect, it } from "vitest";

import type { OAuthOptions, Scope } from "../types";
import { getAdvertisedEndpointUrl } from "./index";

/**
 * @see https://github.com/better-auth/better-auth/issues/12703
 */
describe("getAdvertisedEndpointUrl", () => {
	const ctxWith = (baseURL: string) =>
		({ context: { baseURL } }) as Pick<GenericEndpointContext, "context">;
	const optsWith = (advertisedBaseURL?: string) =>
		({ advertisedBaseURL }) as OAuthOptions<Scope[]>;

	it("republishes the endpoint's own path under the advertised base", () => {
		expect(
			getAdvertisedEndpointUrl(
				ctxWith("https://app.example.com/api/auth"),
				optsWith("https://mcp.example.com"),
				"https://app.example.com/api/auth/oauth2/token",
			),
		).toBe("https://mcp.example.com/oauth2/token");
	});

	it("returns undefined when the option is unset", () => {
		expect(
			getAdvertisedEndpointUrl(
				ctxWith("https://app.example.com"),
				optsWith(),
				"https://app.example.com/oauth2/token",
			),
		).toBeUndefined();
	});

	it("tolerates trailing slashes on either base", () => {
		expect(
			getAdvertisedEndpointUrl(
				ctxWith("https://app.example.com/api/auth//"),
				optsWith("https://mcp.example.com/"),
				"https://app.example.com/api/auth/oauth2/token",
			),
		).toBe("https://mcp.example.com/oauth2/token");
	});

	it("returns undefined for a URL this server does not serve", () => {
		expect(
			getAdvertisedEndpointUrl(
				ctxWith("https://app.example.com"),
				optsWith("https://mcp.example.com"),
				"https://attacker.example.com/oauth2/token",
			),
		).toBeUndefined();
	});

	it("does not match a host that merely extends baseURL", () => {
		expect(
			getAdvertisedEndpointUrl(
				ctxWith("https://app.example.com"),
				optsWith("https://mcp.example.com"),
				"https://app.example.com.attacker.test/oauth2/token",
			),
		).toBeUndefined();
	});

	it("returns undefined when baseURL is empty", () => {
		expect(
			getAdvertisedEndpointUrl(
				ctxWith(""),
				optsWith("https://mcp.example.com"),
				"https://app.example.com/oauth2/token",
			),
		).toBeUndefined();
	});
});
