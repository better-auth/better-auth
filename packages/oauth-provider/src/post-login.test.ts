import { APIError } from "better-auth/api";
import { jwt } from "better-auth/plugins/jwt";
import { organization } from "better-auth/plugins/organization";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it, vi } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import { postLoginClearedParam } from "./signed-query";
import type { OAuthOptions, Scope } from "./types";

const baseURL = "http://localhost:3000";
const redirectURI = "https://client.example.com/callback";

async function createPostLoginTestInstance() {
	const shouldRedirect =
		vi.fn<NonNullable<OAuthOptions<Scope[]>["postLogin"]>["shouldRedirect"]>();
	const instance = await getTestInstance(
		{
			baseURL,
			plugins: [
				organization(),
				jwt(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					scopes: ["openid", "read:organization"],
					postLogin: {
						page: "/select-organization",
						shouldRedirect,
						consentReferenceId: ({ session }) => {
							if (typeof session.activeOrganizationId !== "string") {
								throw new APIError("BAD_REQUEST", {
									message: "Select an organization",
								});
							}

							return session.activeOrganizationId;
						},
					},
				}),
			],
		},
		{ clientOptions: { plugins: [oauthProviderClient()] } },
	);
	const { auth, signInWithTestUser } = instance;
	const { headers } = await signInWithTestUser();
	const organizations = [];

	for (const slug of ["first", "second"]) {
		const organization = await auth.api.createOrganization({
			headers,
			body: { name: slug, slug, keepCurrentActiveOrganization: true },
		});
		if (!organization) throw new Error("Organization was not created");

		organizations.push(organization);
	}

	shouldRedirect.mockImplementation(
		async ({ session, headers, isContinue }) => {
			const memberships = await auth.api.listOrganizations({ headers });
			const hasActiveOrganization = memberships.some(
				(organization) => organization.id === session.activeOrganizationId,
			);

			return !hasActiveOrganization || (!isContinue && memberships.length > 1);
		},
	);

	const oauthClient = await auth.api.adminCreateOAuthClient({
		headers,
		body: { redirect_uris: [redirectURI] },
	});
	const query = new URLSearchParams({
		client_id: oauthClient.client_id,
		redirect_uri: redirectURI,
		response_type: "code",
		scope: "openid read:organization",
		state: "organization-selection",
		code_challenge: "a".repeat(43),
		code_challenge_method: "S256",
	});

	async function authorize(requestHeaders = headers) {
		const response = await auth.handler(
			new Request(`${baseURL}/api/auth/oauth2/authorize?${query}`, {
				headers: requestHeaders,
			}),
		);
		return new URL(response.headers.get("location") ?? "", baseURL);
	}

	return { ...instance, headers, organizations, shouldRedirect, authorize };
}

/** @see https://github.com/better-auth/better-auth/issues/11093 */
describe("post-login organization selection", () => {
	it("continues to consent for a multi-organization user and asks again on a new grant", async () => {
		const { auth, client, headers, organizations, shouldRedirect, authorize } =
			await createPostLoginTestInstance();
		const selection = await authorize();

		expect(selection.pathname).toBe("/select-organization");
		expect(selection.searchParams.get(postLoginClearedParam)).toBeNull();

		await auth.api.setActiveOrganization({
			headers,
			body: { organizationId: organizations[1]!.id },
		});
		const continuation = await client.oauth2.continue({
			postLogin: true,
			oauth_query: selection.search.slice(1),
			fetchOptions: { headers, throw: true },
		});
		const consent = new URL(continuation.url, baseURL);

		expect(consent.pathname).toBe("/consent");
		expect(shouldRedirect).toHaveBeenLastCalledWith(
			expect.objectContaining({ isContinue: true }),
		);

		const result = await client.oauth2.consent({
			accept: true,
			oauth_query: consent.search.slice(1),
			fetchOptions: { headers, throw: true },
		});
		const callback = new URL(result.url);

		expect(callback.origin + callback.pathname).toBe(redirectURI);
		expect(callback.searchParams.get("code")).toBeTruthy();
		expect(callback.searchParams.get("state")).toBe("organization-selection");
		const { adapter } = await auth.$context;
		const savedConsent = await adapter.findOne<{ referenceId: string }>({
			model: "oauthConsent",
			where: [{ field: "referenceId", value: organizations[1]!.id }],
		});
		expect(savedConsent?.referenceId).toBe(organizations[1]!.id);

		expect((await authorize()).pathname).toBe("/select-organization");
		expect(shouldRedirect).toHaveBeenLastCalledWith(
			expect.objectContaining({ isContinue: false }),
		);
	});

	it("keeps the selection page when continuation has no selected organization", async () => {
		const { client, headers, authorize } = await createPostLoginTestInstance();
		const selection = await authorize();
		const continuation = await client.oauth2.continue({
			postLogin: true,
			oauth_query: selection.search.slice(1),
			fetchOptions: { headers, throw: true },
		});
		const redirect = new URL(continuation.url, baseURL);

		expect(redirect.pathname).toBe("/select-organization");
		expect(redirect.searchParams.get("code")).toBeNull();
		expect(redirect.searchParams.get(postLoginClearedParam)).toBeNull();
	});
});
