import type { GoogleProfile } from "@better-auth/core/social-providers";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { signJWT } from "../../crypto";
import { getTestInstance } from "../../test-utils/test-instance";
import { DEFAULT_SECRET } from "../../utils/constants";

let testIdToken: string;
let handlers: ReturnType<typeof http.post>[];

const server = setupServer();

beforeAll(async () => {
	const data: GoogleProfile = {
		email: "user@email.com",
		email_verified: true,
		name: "First Last",
		picture: "https://lh3.googleusercontent.com/a-/AOh14GjQ4Z7Vw",
		exp: 1234567890,
		sub: "1234567890",
		iat: 1234567890,
		aud: "test",
		azp: "test",
		nbf: 1234567890,
		iss: "test",
		locale: "en",
		jti: "test",
		given_name: "First",
		family_name: "Last",
	};
	testIdToken = await signJWT(data, DEFAULT_SECRET);

	handlers = [
		http.post("https://oauth2.googleapis.com/token", () => {
			return HttpResponse.json({
				access_token: "test",
				refresh_token: "test",
				id_token: testIdToken,
			});
		}),
	];

	server.listen({ onUnhandledRequest: "bypass" });
	server.use(...handlers);
});

afterEach(() => {
	server.resetHandlers();
	server.use(...handlers);
});

afterAll(() => server.close());

describe("bearer", async () => {
	const { client, auth, testUser } = await getTestInstance(
		{},
		{
			disableTestUser: true,
		},
	);

	let token: string;
	it("should get session", async () => {
		await client.signUp.email(
			{
				email: testUser.email,
				password: testUser.password,
				name: testUser.name,
			},
			{
				onSuccess: (ctx) => {
					token = ctx.response.headers.get("set-auth-token") || "";
				},
			},
		);
		const session = await client.getSession({
			fetchOptions: {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		});
		expect(session.data?.session).toBeDefined();
	});

	it("should list session", async () => {
		const sessions = await client.listSessions({
			fetchOptions: {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		});
		expect(sessions.data).toHaveLength(1);
	});

	it("should work on server actions", async () => {
		const session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${token}`,
			}),
		});
		expect(session?.session).toBeDefined();
	});

	it("should work with ", async () => {
		const session = await client.getSession({
			fetchOptions: {
				headers: {
					authorization: `Bearer ${token.split(".")[0]}`,
				},
			},
		});
		expect(session.data?.session).toBeDefined();
	});

	it("should work if valid cookie is provided even if authorization header isn't valid", async () => {
		const session = await client.getSession({
			fetchOptions: {
				headers: {
					Authorization: `Bearer invalid.token`,
					cookie: `better-auth.session_token=${token}`,
				},
			},
		});
		expect(session.data?.session).toBeDefined();
	});

	it("should add set-auth-token to redirect URL in social login callback", async () => {
		const { client: socialClient, cookieSetter } = await getTestInstance(
			{
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
					},
				},
			},
			{
				disableTestUser: true,
			},
		);

		const headers = new Headers();
		const res = await socialClient.signIn.social(
			{
				provider: "google",
				callbackURL: "http://localhost:3000/dashboard",
			},
			{
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		);

		const state = new URL(res.url!).searchParams.get("state");

		let redirectLocation: string | null = null;
		let authToken: string | null = null;

		await socialClient.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			headers,
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				redirectLocation = context.response.headers.get("location");
				authToken = context.response.headers.get("set-auth-token");
			},
		});

		expect(redirectLocation).toBeDefined();
		expect(authToken).toBeDefined();
		expect(redirectLocation).toContain("set-auth-token=");

		// Verify the token in the URL matches the header
		const redirectURL = new URL(redirectLocation!);
		const tokenFromURL = redirectURL.searchParams.get("set-auth-token");
		expect(tokenFromURL).toBe(authToken);

		// Verify the token is valid by using it as a bearer token
		const session = await socialClient.getSession({
			fetchOptions: {
				headers: {
					Authorization: `Bearer ${authToken}`,
				},
			},
		});
		expect(session.data?.session).toBeDefined();
		expect(session.data?.user.email).toBe("user@email.com");
	});
});
