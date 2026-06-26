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

/**
 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-rjg6
 */
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
		const ctx = await auth.$context;
		const provider = await ctx.adapter.findOne<{ providerKey: string }>({
			model: "scimProvider",
			where: [{ field: "providerId", value: "okta" }],
		});
		expect(provider?.providerKey).toBe(`${org!.id}:okta`);

		const provisioned = await auth.api.createSCIMUser({
			body: { userName: "u@acme.test", emails: [{ value: "u@acme.test" }] },
			headers: { authorization: `Bearer ${scimToken}` },
		});

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
		const victim = await ctx.internalAdapter.createUser(
			{
				email: "victim@acme.test",
				name: "victim",
			},
			{ method: "test" },
		);
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

	it("rejects legacy database provider rows without an organization scope", async () => {
		const { auth } = instance();
		const ctx = await auth.$context;
		type LegacySCIMProviderRow = {
			providerId: string;
			scimToken: string;
			organizationId: null;
		};
		await ctx.adapter.create<LegacySCIMProviderRow>({
			model: "scimProvider",
			data: {
				providerId: "legacy",
				scimToken: "legacy-token",
				organizationId: null,
			},
		});
		const legacyToken = Buffer.from("legacy-token:legacy").toString("base64");

		await expect(
			auth.api.createSCIMUser({
				body: { userName: "legacy@acme.test" },
				headers: { authorization: `Bearer ${legacyToken}` },
			}),
		).rejects.toThrowError(
			expect.objectContaining({ message: "Invalid SCIM token" }),
		);
	});

	it("rotates runtime provider connections by organization-scoped provider key", async () => {
		const { auth, signIn } = instance();
		const headers = await signIn("owner@rotation.test");
		const org = await auth.api.createOrganization({
			body: { slug: "rotation", name: "Rotation" },
			headers,
		});

		await auth.api.generateSCIMToken({
			body: { providerId: "okta", organizationId: org!.id },
			headers,
		});
		await auth.api.generateSCIMToken({
			body: { providerId: "okta", organizationId: org!.id },
			headers,
		});

		const ctx = await auth.$context;
		const providers = await ctx.adapter.findMany<{ providerKey: string }>({
			model: "scimProvider",
			where: [{ field: "providerKey", value: `${org!.id}:okta` }],
		});
		expect(providers).toHaveLength(1);
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

	it("rejects org-scoped staticProviders without the organization plugin", async () => {
		const auth = betterAuth({
			database: memoryAdapter(emptyData()),
			baseURL: "http://localhost:3000",
			emailAndPassword: { enabled: true },
			plugins: [
				scim({
					staticProviders: [
						{
							providerId: "app",
							scimToken: "secret",
							organizationId: "org",
						},
					],
				}),
			],
		});
		await expect(auth.$context).rejects.toThrow(/organization plugin/);
	});

	it("rejects staticProviders that can forge SCIM account namespace segments", async () => {
		const auth = betterAuth({
			database: memoryAdapter(emptyData()),
			baseURL: "http://localhost:3000",
			emailAndPassword: { enabled: true },
			plugins: [
				scim({
					staticProviders: [
						{
							providerId: "org:okta",
							scimToken: "secret",
						},
					],
				}),
			],
		});
		await expect(auth.$context).rejects.toThrow(/cannot contain `:`/);
	});
});
