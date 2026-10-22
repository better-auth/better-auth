import { organization } from "better-auth/plugins";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { apiKey } from ".";
import { apiKeyClient } from "./client";

async function setup() {
	const { auth, client, signInWithTestUser, cookieSetter } =
		await getTestInstance(
			{
				session: { cookieCache: { enabled: true, maxAge: 300 } },
				plugins: [organization(), apiKey({ enableSessionForAPIKeys: true })],
			},
			{ clientOptions: { plugins: [apiKeyClient()] } },
		);
	const { headers: userHeaders } = await signInWithTestUser();
	const org = await auth.api.createOrganization({
		body: { name: "o", slug: "o" },
		headers: userHeaders,
	});
	const { data: key } = await client.apiKey.create(
		{},
		{ headers: userHeaders },
	);
	const keyHeaders = new Headers({ "x-api-key": key!.key });
	return {
		auth,
		userHeaders,
		keyHeaders,
		organizationId: org!.id,
		cookieSetter,
	};
}

describe("organization routes with an API-key session", () => {
	it("accepts a valid API key sent without a session cookie", async () => {
		const { auth, keyHeaders, organizationId } = await setup();
		const res = await auth.api.listMembers({
			query: { organizationId },
			headers: keyHeaders,
			asResponse: true,
		});
		expect(res.status).toBe(200);
	});

	it("accepts a valid API key on handlers that read the session directly", async () => {
		const { auth, keyHeaders } = await setup();
		const res = await auth.api.createOrganization({
			body: { name: "second", slug: "second" },
			headers: keyHeaders,
			asResponse: true,
		});
		expect(res.status).toBe(200);
	});

	it("still rejects a revoked session cookie sent together with an API key", async () => {
		const { auth, userHeaders, keyHeaders, organizationId } = await setup();
		const session = await auth.api.getSession({ headers: userHeaders });
		const ctx = await auth.$context;
		await ctx.internalAdapter.deleteSession(session!.session.token);

		const headers = new Headers(userHeaders);
		headers.set("x-api-key", keyHeaders.get("x-api-key")!);
		const res = await auth.api.listMembers({
			query: { organizationId },
			headers,
			asResponse: true,
		});
		expect(res.status).toBe(401);
	});
});
