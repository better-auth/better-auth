import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { getTestInstance } from "./test-utils/test-instance";

const oidcAssertionType =
	"urn:vercel:params:oauth:client-assertion-type:oidc-bearer";
const tokenRequest = vi.fn(async ({ request }: { request: Request }) => {
	const body = new URLSearchParams(await request.text());
	expect(body.get("grant_type")).toBe("authorization_code");
	expect(body.get("client_id")).toBe("vercel-client");
	expect(body.get("client_assertion")).toBe("workload-oidc-token");
	expect(body.get("client_assertion_type")).toBe(oidcAssertionType);
	expect(body.get("code_verifier")).toBeTruthy();
	expect(body.get("redirect_uri")).toBe(
		"http://localhost:3000/api/auth/callback/vercel",
	);
	expect(body.has("client_secret")).toBe(false);
	expect(request.headers.has("authorization")).toBe(false);
	return HttpResponse.json({
		access_token: "user-access-token",
		token_type: "Bearer",
		expires_in: 3600,
	});
});
const server = setupServer(
	http.post("https://api.vercel.com/login/oauth/token", tokenRequest),
	http.get("https://api.vercel.com/login/oauth/userinfo", ({ request }) => {
		expect(request.headers.get("authorization")).toBe(
			"Bearer user-access-token",
		);
		return HttpResponse.json({
			sub: "vercel-user",
			email: "user@example.com",
			email_verified: true,
			name: "Vercel User",
		});
	}),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

it("creates a session through the built-in Vercel callback using workload OIDC", async () => {
	const getOidcToken = vi.fn(async () => "workload-oidc-token");
	const { client, auth, cookieSetter } = await getTestInstance(
		{
			socialProviders: {
				vercel: {
					clientId: "vercel-client",
					tokenEndpointAuth: {
						method: "custom",
						async customizeRequest({ body }) {
							body.set("client_id", "vercel-client");
							body.set("client_assertion", await getOidcToken());
							body.set("client_assertion_type", oidcAssertionType);
						},
					},
				},
			},
		},
		{ disableTestUser: true },
	);
	const headers = new Headers();
	const signIn = await client.signIn.social({
		provider: "vercel",
		callbackURL: "/dashboard",
		fetchOptions: { onSuccess: cookieSetter(headers) },
	});
	expect(signIn.error).toBeNull();
	expect(getOidcToken).not.toHaveBeenCalled();
	const authorizationUrl = new URL(signIn.data!.url!);
	const callbackUrl = new URL(
		authorizationUrl.searchParams.get("redirect_uri")!,
	);
	callbackUrl.searchParams.set(
		"state",
		authorizationUrl.searchParams.get("state")!,
	);
	callbackUrl.searchParams.set("code", "authorization-code");

	const response = await auth.handler(new Request(callbackUrl, { headers }));
	expect(response.status).toBe(302);
	expect(response.headers.get("location")).toBe("/dashboard");
	expect(tokenRequest).toHaveBeenCalledOnce();
	expect(getOidcToken).toHaveBeenCalledOnce();
	cookieSetter(headers)({ response });

	const session = await client.getSession({ fetchOptions: { headers } });
	expect(session.data?.user.email).toBe("user@example.com");
	expect(session.data?.user.emailVerified).toBe(true);
	const ctx = await auth.$context;
	const accounts = await ctx.internalAdapter.findAccounts(
		session.data!.user.id,
	);
	expect(accounts).toHaveLength(1);
	expect(accounts[0]?.providerId).toBe("vercel");
	expect(accounts[0]?.accountId).toBe("vercel-user");
});
