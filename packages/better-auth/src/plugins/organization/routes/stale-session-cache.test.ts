import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../../test-utils/test-instance";
import { organization } from "../organization";

async function setup() {
	const { auth, client, testUser, cookieSetter } = await getTestInstance({
		session: { cookieCache: { enabled: true, maxAge: 300 } },
		plugins: [organization()],
	});

	const headers = new Headers();
	await client.signIn.email(
		{ email: testUser.email, password: testUser.password },
		{ onSuccess: cookieSetter(headers) },
	);
	const cached = await client.getSession({
		fetchOptions: { headers, onSuccess: cookieSetter(headers) },
	});
	expect(cached.data).not.toBeNull();
	expect(headers.get("cookie")).toContain("session_data");

	const org = await client.$fetch<{ id: string }>("/organization/create", {
		method: "POST",
		body: { name: "stale-cache-org", slug: "stale-cache-org" },
		headers,
	});
	expect(org.error).toBeNull();

	const ctx = await auth.$context;
	await ctx.internalAdapter.deleteSession(cached.data!.session.token);

	return { client, headers, organizationId: org.data!.id };
}

describe("organization routes with a revoked session behind the cookie cache", () => {
	it.each([
		[
			"create",
			"POST",
			"/organization/create",
			() => ({ name: "n", slug: "n" }),
		],
		[
			"has-permission",
			"POST",
			"/organization/has-permission",
			(id: string) => ({
				organizationId: id,
				permissions: { organization: ["update"] },
			}),
		],
		[
			"update",
			"POST",
			"/organization/update",
			(id: string) => ({ organizationId: id, data: { name: "renamed" } }),
		],
		[
			"delete",
			"POST",
			"/organization/delete",
			(id: string) => ({ organizationId: id }),
		],
		[
			"invite-member",
			"POST",
			"/organization/invite-member",
			(id: string) => ({
				organizationId: id,
				email: "invitee@test.com",
				role: "member",
			}),
		],
		[
			"leave",
			"POST",
			"/organization/leave",
			(id: string) => ({ organizationId: id }),
		],
	])("rejects %s", async (_name, method, path, body) => {
		const { client, headers, organizationId } = await setup();
		const res = await client.$fetch(path, {
			method,
			body: body(organizationId),
			headers,
		});
		expect(res.error?.status).toBe(401);
	});

	it.each([
		["list-members", "/organization/list-members"],
		["get-full-organization", "/organization/get-full-organization"],
	])("rejects %s", async (_name, path) => {
		const { client, headers, organizationId } = await setup();
		const res = await client.$fetch(
			`${path}?organizationId=${organizationId}`,
			{ headers },
		);
		expect(res.error?.status).toBe(401);
	});
});
