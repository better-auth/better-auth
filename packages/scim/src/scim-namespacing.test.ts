import { sso } from "@better-auth/sso";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthClient } from "better-auth/client";
import { setCookieToHeader } from "better-auth/cookies";
import { organization } from "better-auth/plugins";
import { describe, expect, it } from "vitest";
import { scim } from ".";
import { scimClient } from "./client";

const emptyData = () => ({
	user: [],
	session: [],
	verification: [],
	account: [],
	ssoProvider: [],
	scimProvider: [],
	scimGroup: [],
	scimGroupMember: [],
	scimGroupRole: [],
	scimGroupRoleGrant: [],
	organization: [],
	member: [],
});

const instance = () => {
	const auth = betterAuth({
		database: memoryAdapter(emptyData()),
		baseURL: "http://localhost:3000",
		emailAndPassword: { enabled: true },
		plugins: [sso(), scim(), organization()],
	});
	const authClient = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [scimClient()],
		fetchOptions: {
			customFetchImpl: async (url, init) =>
				auth.handler(new Request(url, init)),
		},
	});
	const signIn = async (email: string) => {
		const headers = new Headers();
		await authClient.signUp.email({ email, password: "password", name: email });
		await authClient.signIn.email(
			{ email, password: "password" },
			{ throw: true, onSuccess: setCookieToHeader(headers) },
		);
		return headers;
	};
	return { auth, signIn };
};

describe("SCIM account namespacing", () => {
	it("stores the SCIM account under a namespaced providerId, not the logical id", async () => {
		const { auth, signIn } = instance();
		const headers = await signIn("owner@acme.test");
		const org = await auth.api.createOrganization({
			body: { slug: "acme", name: "Acme" },
			headers,
		});
		const { scimToken } = await auth.api.generateSCIMToken({
			body: { providerId: "okta", organizationId: org!.id },
			headers,
		});

		const provisioned = await auth.api.createSCIMUser({
			body: { userName: "u@acme.test", emails: [{ value: "u@acme.test" }] },
			headers: { authorization: `Bearer ${scimToken}` },
		});

		const ctx = await auth.$context;
		const accounts = await ctx.internalAdapter.findAccounts(provisioned.id);
		const scimAccount = accounts.find((a) => a.accountId === "u@acme.test");
		expect(scimAccount?.providerId).toBe(`scim:${org!.id}:okta`);
		expect(scimAccount?.providerId).not.toBe("okta");
	});

	it("cannot resolve an account a colliding provider id created outside SCIM", async () => {
		const { auth, signIn } = instance();
		const headers = await signIn("owner@acme.test");
		const org = await auth.api.createOrganization({
			body: { slug: "acme", name: "Acme" },
			headers,
		});

		const ctx = await auth.$context;
		const victim = await ctx.internalAdapter.createUser({
			email: "victim@acme.test",
			name: "victim",
		});
		await ctx.internalAdapter.createAccount({
			userId: victim.id,
			providerId: "okta",
			accountId: "victim@acme.test",
			accessToken: "",
			refreshToken: "",
		});

		const { scimToken } = await auth.api.generateSCIMToken({
			body: { providerId: "okta", organizationId: org!.id },
			headers,
		});

		await expect(
			auth.api.getSCIMUser({
				params: { userId: victim.id },
				headers: { authorization: `Bearer ${scimToken}` },
			}),
		).rejects.toThrowError(
			expect.objectContaining({ message: "User not found" }),
		);
	});

	it("isolates two organizations that register the same logical provider id", async () => {
		const { auth, signIn } = instance();
		const headersA = await signIn("a@x.test");
		const headersB = await signIn("b@y.test");
		const orgA = await auth.api.createOrganization({
			body: { slug: "org-a", name: "Org A" },
			headers: headersA,
		});
		const orgB = await auth.api.createOrganization({
			body: { slug: "org-b", name: "Org B" },
			headers: headersB,
		});
		const { scimToken: tokenA } = await auth.api.generateSCIMToken({
			body: { providerId: "okta", organizationId: orgA!.id },
			headers: headersA,
		});
		const { scimToken: tokenB } = await auth.api.generateSCIMToken({
			body: { providerId: "okta", organizationId: orgB!.id },
			headers: headersB,
		});

		const userA = await auth.api.createSCIMUser({
			body: { userName: "shared@x.test", emails: [{ value: "shared@x.test" }] },
			headers: { authorization: `Bearer ${tokenA}` },
		});
		const userB = await auth.api.createSCIMUser({
			body: { userName: "shared@y.test", emails: [{ value: "shared@y.test" }] },
			headers: { authorization: `Bearer ${tokenB}` },
		});

		const listA = await auth.api.listSCIMUsers({
			headers: { authorization: `Bearer ${tokenA}` },
		});
		expect(listA.Resources?.map((r) => r.id)).toEqual([userA.id]);
		const listB = await auth.api.listSCIMUsers({
			headers: { authorization: `Bearer ${tokenB}` },
		});
		expect(listB.Resources?.map((r) => r.id)).toEqual([userB.id]);
	});

	it("rejects a stored org-scoped token without the organization segment", async () => {
		const { auth, signIn } = instance();
		const headers = await signIn("owner@acme.test");
		const org = await auth.api.createOrganization({
			body: { slug: "org-token", name: "Org Token" },
			headers,
		});
		const { scimToken } = await auth.api.generateSCIMToken({
			body: { providerId: "okta", organizationId: org!.id },
			headers,
		});
		const [rawToken, providerId] = Buffer.from(scimToken, "base64")
			.toString("utf8")
			.split(":");
		const orglessToken = Buffer.from(`${rawToken}:${providerId}`).toString(
			"base64",
		);

		await expect(
			auth.api.createSCIMUser({
				body: { userName: "missing-org@acme.test" },
				headers: { authorization: `Bearer ${orglessToken}` },
			}),
		).rejects.toThrowError(
			expect.objectContaining({ message: "Invalid SCIM token" }),
		);
	});
});

describe("SCIM plugin requirements", () => {
	it("throws at init without the organization plugin and without staticProviders", async () => {
		const auth = betterAuth({
			database: memoryAdapter(emptyData()),
			baseURL: "http://localhost:3000",
			emailAndPassword: { enabled: true },
			plugins: [scim()],
		});
		await expect(auth.$context).rejects.toThrow(/organization plugin/);
	});

	it("does not require the organization plugin when staticProviders is configured", async () => {
		const auth = betterAuth({
			database: memoryAdapter(emptyData()),
			baseURL: "http://localhost:3000",
			emailAndPassword: { enabled: true },
			plugins: [
				scim({
					staticProviders: [{ providerId: "app", scimToken: "secret" }],
				}),
			],
		});
		await expect(auth.$context).resolves.toBeTruthy();
	});
});
