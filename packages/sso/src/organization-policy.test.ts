import { getCurrentAdapter } from "@better-auth/core/context";
import type { GenericEndpointContext } from "better-auth";
import { APIError } from "better-auth/api";
import { organization } from "better-auth/plugins";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { sso } from ".";
import { assignOrganizationFromProvider } from "./linking/org-assignment";
import type { SSOOptions, SSOProvider } from "./types";

const oidcConfig = {
	clientId: "policy-client",
	clientSecret: "test-secret",
	skipDiscovery: true,
	authorizationEndpoint: "https://idp.example.com/authorize",
	tokenEndpoint: "https://idp.example.com/token",
	jwksEndpoint: "https://idp.example.com/jwks",
};
async function fixture(options: SSOOptions = {}) {
	const f = await getTestInstance(
		{ plugins: [organization(), sso(options)] },
		{ transaction: true },
	);
	const owner = await f.signInWithTestUser();
	const org = await f.auth.api.createOrganization({
		headers: owner.headers,
		body: { name: "SSO Policy Org", slug: "sso-policy-org" },
	});
	if (!org) throw new Error("Organization was not created");
	const person = await f.auth.api.signUpEmail({
		body: {
			email: "employee@example.com",
			name: "Employee",
			password: "password123",
		},
	});
	const employee = await f.signInWithUser(
		"employee@example.com",
		"password123",
	);
	const context = await f.auth.$context;
	const register = (
		organizationId: string | undefined = org.id,
		headers = owner.headers,
	) => {
		const requestHeaders = new Headers(headers);
		requestHeaders.set("content-type", "application/json");
		return f.auth.handler(
			new Request("http://localhost:3000/api/auth/sso/register", {
				method: "POST",
				headers: requestHeaders,
				body: JSON.stringify({
					providerId: "policy-idp",
					issuer: "https://idp.example.com",
					domain: "example.com",
					organizationId,
					oidcConfig,
				}),
			}),
		);
	};
	const provider = () =>
		context.adapter.findOne<SSOProvider<SSOOptions>>({
			model: "ssoProvider",
			where: [{ field: "providerId", value: "policy-idp" }],
		});
	const member = () =>
		context.adapter.findOne<{ id: string }>({
			model: "member",
			where: [
				{ field: "organizationId", value: org.id },
				{ field: "userId", value: person.user.id },
			],
		});
	const assign = async () => {
		const p = await provider();
		if (!p) throw new Error("Provider was not registered");
		await assignOrganizationFromProvider(
			{ context } as GenericEndpointContext,
			{
				user: person.user,
				provider: p,
				provisioningOptions: options.organizationProvisioning,
				profile: {
					providerType: "oidc",
					providerId: p.providerId,
					accountId: "employee-subject",
					email: person.user.email,
					emailVerified: true,
				},
			},
		);
	};
	return {
		...f,
		org,
		context,
		person,
		employee,
		register,
		provider,
		member,
		assign,
	};
}

/** @see https://github.com/better-auth/better-auth/issues/11569 */
describe("SSO organization policy with native persistence", () => {
	it("authorizes registration before entering the insertion fence", async () => {
		const calls: string[] = [];
		const f = await fixture({
			authorizeProviderRegistration: async ({ organizationId }) => {
				calls.push(organizationId);
				throw new APIError("FORBIDDEN", { message: "Policy denied" });
			},
			withProviderRegistration: async ({ create }) => {
				calls.push("fence");
				return create();
			},
		});
		expect((await f.register()).status).toBe(403);
		expect(calls).toEqual([f.org.id]);
		expect(await f.provider()).toBeNull();
	});

	it("uses the insertion transaction and rolls back a post-insert rejection", async () => {
		let checked = false;
		const f = await fixture({
			withProviderRegistration: async ({ database, create }) => {
				await create();
				expect(
					await database.findOne({
						model: "ssoProvider",
						where: [{ field: "providerId", value: "policy-idp" }],
					}),
				).toBeDefined();
				checked = true;
				throw new APIError("CONFLICT", { message: "Policy changed" });
			},
		});
		expect((await f.register()).status).toBe(409);
		expect(checked).toBe(true);
		expect(await f.provider()).toBeNull();
	});

	it("retains native administrator checks before policy callbacks", async () => {
		let called = false;
		const f = await fixture({
			authorizeProviderRegistration: async () => {
				called = true;
			},
		});
		await f.auth.api.addMember({
			body: {
				organizationId: f.org.id,
				userId: f.person.user.id,
				role: "member",
			},
		});
		expect((await f.register(f.org.id, f.employee.headers)).status).toBe(403);
		expect(called).toBe(false);
		expect(await f.provider()).toBeNull();
	});

	it("does not apply organization callbacks to an unbound provider", async () => {
		let called = false;
		const f = await fixture({
			authorizeProviderRegistration: async () => {
				called = true;
			},
		});
		const response = await f.register("", f.employee.headers);
		expect(response.status).toBe(200);
		expect(called).toBe(false);
	});

	it("binds assignment reads and writes to the current transaction and rolls them back", async () => {
		let called = false;
		const f = await fixture({
			organizationProvisioning: {
				withOrganizationAssignment: async ({
					organizationId,
					database,
					assign,
				}) => {
					called = true;
					expect(organizationId).toBe(f.org.id);
					expect(await getCurrentAdapter(f.context.adapter)).toBe(database);
					await assign();
					expect(
						await database.findOne({
							model: "member",
							where: [
								{ field: "organizationId", value: organizationId },
								{ field: "userId", value: f.person.user.id },
							],
						}),
					).toBeDefined();
					throw new APIError("CONFLICT", { message: "Policy changed" });
				},
			},
		});
		expect((await f.register()).status).toBe(200);
		await expect(f.assign()).rejects.toMatchObject({ status: "CONFLICT" });
		expect(called).toBe(true);
		expect(await f.member()).toBeNull();
	});

	it("does not call assignment policy when provisioning is disabled", async () => {
		let called = false;
		const f = await fixture({
			organizationProvisioning: {
				disabled: true,
				withOrganizationAssignment: async ({ assign }) => {
					called = true;
					await assign();
				},
			},
		});
		expect((await f.register()).status).toBe(200);
		await f.assign();
		expect(called).toBe(false);
		expect(await f.member()).toBeNull();
	});
});
