import { bearer, organization } from "better-auth/plugins";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { apiKey } from ".";
import { apiKeyClient } from "./client";

async function setup() {
	const { auth, client, testUser, cookieSetter } = await getTestInstance(
		{
			session: { cookieCache: { enabled: true, maxAge: 300 } },
			plugins: [
				bearer(),
				organization(),
				apiKey({ enableSessionForAPIKeys: true }),
			],
		},
		{ clientOptions: { plugins: [apiKeyClient()] } },
	);

	const userHeaders = new Headers();
	let bearerToken = "";
	await client.signIn.email(
		{ email: testUser.email, password: testUser.password },
		{
			onSuccess: (context) => {
				bearerToken = context.response.headers.get("set-auth-token") ?? "";
				cookieSetter(userHeaders)(context);
			},
		},
	);
	await client.getSession({
		fetchOptions: {
			headers: userHeaders,
			onSuccess: cookieSetter(userHeaders),
		},
	});
	expect(userHeaders.get("cookie")).toContain("session_data");
	expect(bearerToken).not.toBe("");

	const org = await auth.api.createOrganization({
		body: { name: "o", slug: "o" },
		headers: userHeaders,
	});
	const { data: key } = await client.apiKey.create(
		{},
		{ headers: userHeaders },
	);
	const session = await auth.api.getSession({ headers: userHeaders });
	const revokeSession = async () => {
		const ctx = await auth.$context;
		await ctx.internalAdapter.deleteSession(session!.session.token);
	};

	return {
		auth,
		userHeaders,
		apiKey: key!.key,
		bearerToken,
		organizationId: org!.id,
		revokeSession,
	};
}

/**
 * @see https://github.com/better-auth/better-auth/issues/10232
 */
describe("organization routes with an API-key session", () => {
	it("accepts a valid API key sent without a session cookie", async () => {
		const { auth, apiKey, organizationId } = await setup();
		const res = await auth.api.listMembers({
			query: { organizationId },
			headers: new Headers({ "x-api-key": apiKey }),
			asResponse: true,
		});
		expect(res.status).toBe(200);
	});

	it("accepts a valid API key on handlers that read the session directly", async () => {
		const { auth, apiKey } = await setup();
		const res = await auth.api.createOrganization({
			body: { name: "second", slug: "second" },
			headers: new Headers({ "x-api-key": apiKey }),
			asResponse: true,
		});
		expect(res.status).toBe(200);
	});

	it("still rejects a revoked session cookie sent together with an API key", async () => {
		const { auth, userHeaders, apiKey, organizationId, revokeSession } =
			await setup();
		await revokeSession();

		const headers = new Headers(userHeaders);
		headers.set("x-api-key", apiKey);
		const res = await auth.api.listMembers({
			query: { organizationId },
			headers,
			asResponse: true,
		});
		expect(res.status).toBe(401);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/10232
 */
describe("organization routes with a bearer token", () => {
	it("accepts a valid bearer token", async () => {
		const { auth, bearerToken, organizationId } = await setup();
		const res = await auth.api.listMembers({
			query: { organizationId },
			headers: new Headers({ authorization: `Bearer ${bearerToken}` }),
			asResponse: true,
		});
		expect(res.status).toBe(200);
	});

	it("rejects a bearer token whose session was revoked", async () => {
		const { auth, bearerToken, organizationId, revokeSession } = await setup();
		await revokeSession();
		const res = await auth.api.listMembers({
			query: { organizationId },
			headers: new Headers({ authorization: `Bearer ${bearerToken}` }),
			asResponse: true,
		});
		expect(res.status).toBe(401);
	});
});
