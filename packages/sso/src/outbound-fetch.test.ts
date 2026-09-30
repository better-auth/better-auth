import { betterFetch } from "@better-fetch/fetch";
import { getTestInstance } from "better-auth/test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, expect, it, vi } from "vitest";
import { sso } from ".";
import { ssoClient } from "./client";

const dns = vi.hoisted(() => ({
	lookup: vi.fn(),
	resolve4: vi.fn(),
	resolve6: vi.fn(),
}));
vi.mock("node:dns/promises", () => dns);

afterEach(() => vi.restoreAllMocks());

/**
 * @see https://developers.cloudflare.com/workers/runtime-apis/nodejs/dns/
 */
it("completes public-host OIDC sign-in with record resolvers and verified identity", async () => {
	dns.lookup.mockRejectedValue(new Error("Not implemented"));
	dns.resolve4.mockResolvedValue(["cdn.idp.example.", "93.184.216.34"]);
	dns.resolve6.mockRejectedValue({ code: "ENODATA" });
	const issuer = "https://idp.example";
	const { privateKey, publicKey } = await generateKeyPair("RS256");
	const jwk = {
		...(await exportJWK(publicKey)),
		kid: "public-host-key",
		alg: "RS256",
	};
	const idToken = await new SignJWT({
		email: "public-host@example.com",
		email_verified: true,
		name: "Public Host User",
	})
		.setProtectedHeader({ alg: "RS256", kid: jwk.kid })
		.setIssuer(issuer)
		.setAudience("public-host-client")
		.setSubject("public-host-subject")
		.setIssuedAt()
		.setExpirationTime("5m")
		.sign(privateKey);
	const requested: string[] = [];
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
		const url = new URL(
			typeof input === "string"
				? input
				: input instanceof URL
					? input.href
					: input.url,
		);
		expect(url.origin).toBe(issuer);
		expect(init?.redirect).toBe("manual");
		requested.push(url.pathname);
		if (url.pathname === "/.well-known/openid-configuration")
			return Response.json({
				issuer,
				authorization_endpoint: `${issuer}/authorize`,
				token_endpoint: `${issuer}/token`,
				jwks_uri: `${issuer}/jwks`,
				userinfo_endpoint: `${issuer}/userinfo`,
			});
		if (url.pathname === "/token")
			return Response.json({
				access_token: "public-host-access-token",
				token_type: "Bearer",
				expires_in: 300,
				id_token: idToken,
			});
		if (url.pathname === "/jwks") return Response.json({ keys: [jwk] });
		if (url.pathname === "/userinfo")
			return Response.json({
				sub: "public-host-subject",
				email: "public-host@example.com",
				email_verified: true,
				name: "Public Host User",
			});
		throw new Error(`Unexpected mock endpoint ${url.pathname}`);
	});
	const { auth, client, signInWithTestUser, cookieSetter, customFetchImpl } =
		await getTestInstance(
			{
				plugins: [sso()],
			},
			{ clientOptions: { plugins: [ssoClient()] } },
		);
	const { headers: registrationHeaders } = await signInWithTestUser();
	await auth.api.registerSSOProvider({
		headers: registrationHeaders,
		body: {
			providerId: "public-host",
			issuer,
			domain: "example.com",
			oidcConfig: {
				clientId: "public-host-client",
				clientSecret: "public-host-secret",
				discoveryEndpoint: `${issuer}/.well-known/openid-configuration`,
			},
		},
	});
	const stateHeaders = new Headers();
	const signIn = await client.signIn.sso({
		providerId: "public-host",
		callbackURL: "/dashboard",
		fetchOptions: { throw: true, onSuccess: cookieSetter(stateHeaders) },
	});
	const authorizationUrl = new URL(signIn.url);
	const callbackUrl = new URL(
		authorizationUrl.searchParams.get("redirect_uri")!,
	);
	callbackUrl.search = new URLSearchParams({
		code: "public-host-code",
		state: authorizationUrl.searchParams.get("state")!,
	}).toString();
	const sessionHeaders = new Headers();
	let destination: string | null = null;
	await betterFetch(callbackUrl.href, {
		customFetchImpl,
		headers: stateHeaders,
		redirect: "manual",
		onError(context) {
			destination = context.response.headers.get("location");
			cookieSetter(sessionHeaders)(context);
		},
	});
	expect(destination).toBe("/dashboard");
	const session = await client.getSession({
		fetchOptions: { headers: sessionHeaders },
	});
	expect(session.data?.user.email).toBe("public-host@example.com");
	expect(requested).toEqual([
		"/.well-known/openid-configuration",
		"/token",
		"/jwks",
		"/userinfo",
	]);
	expect(dns.resolve4).toHaveBeenCalledTimes(4);
	expect(dns.resolve6).toHaveBeenCalledTimes(4);
});
