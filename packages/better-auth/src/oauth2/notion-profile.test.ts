import { getTestInstance } from "better-auth/test";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/**
 * @see https://developers.notion.com/reference/user
 * @see https://github.com/better-auth/better-auth/issues/8742
 */
it.each(["sign-in", "link"] as const)(
	"preserves the stored image when Notion has no avatar during %s",
	async (flow) => {
		const storedImage = "https://example.com/stored-avatar.png";
		const { auth, client, testUser, signInWithTestUser, cookieSetter } =
			await getTestInstance(
				{
					socialProviders: {
						notion: {
							clientId: "notion-app",
							clientSecret: "notion-secret",
							overrideUserInfoOnSignIn: true,
						},
					},
					account: {
						accountLinking: {
							trustedProviders: ["notion"],
							updateUserInfoOnLink: true,
						},
					},
				},
				{ testUser: { image: storedImage } },
			);
		const { user, headers } = await signInWithTestUser();
		const ctx = await auth.$context;
		if (flow === "sign-in") {
			await ctx.internalAdapter.createAccount({
				userId: user.id,
				providerId: "notion",
				accountId: "notion-owner",
			});
		}
		server.use(
			http.post("https://api.notion.com/v1/oauth/token", () =>
				HttpResponse.json({
					access_token: "notion-token",
					token_type: "bearer",
				}),
			),
			http.get("https://api.notion.com/v1/users/me", () =>
				HttpResponse.json({
					bot: {
						owner: {
							user: {
								object: "user",
								id: "notion-owner",
								type: "person",
								name: "Notion User",
								avatar_url: null,
								person: { email: testUser.email },
							},
						},
					},
				}),
			),
		);
		const request = { provider: "notion" as const, callbackURL: "/" };
		const options = { headers, onSuccess: cookieSetter(headers) };
		const response =
			flow === "link"
				? await client.linkSocial(request, options)
				: await client.signIn.social(request, options);
		expect(response.error).toBeNull();
		const state = new URL(response.data!.url!).searchParams.get("state");
		await client.$fetch("/callback/notion", {
			query: { state, code: "notion-code" },
			headers,
			onError({ response }) {
				expect(response.status).toBe(302);
				expect(
					new URL(
						response.headers.get("location")!,
						"http://localhost:3000",
					).searchParams.get("error"),
				).toBeNull();
			},
		});
		const updated = await ctx.internalAdapter.findUserById(user.id);
		expect(updated?.name).toBe("Notion User");
		expect(updated?.image).toBe(storedImage);
	},
);
