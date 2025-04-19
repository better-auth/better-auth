import { describe, expect, it, vi } from "vitest";
import { anonymous } from ".";
import { getTestInstance } from "../../test-utils/test-instance";
import { createAuthClient } from "../../client";
import { anonymousClient } from "./client";
import type { GoogleProfile } from "../../social-providers";
import { DEFAULT_SECRET } from "../../utils/constants";
import { getOAuth2Tokens } from "../../oauth2";
import { signJWT } from "../../crypto/jwt";

vi.mock("../../oauth2", async (importOriginal) => {
	const original = (await importOriginal()) as any;
	return {
		...original,
		validateAuthorizationCode: vi
			.fn()
			.mockImplementation(async (...args: any) => {
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
				const testIdToken = await signJWT(data, DEFAULT_SECRET);
				const tokens = getOAuth2Tokens({
					access_token: "test",
					refresh_token: "test",
					id_token: testIdToken,
				});
				return tokens;
			}),
	};
});

describe("anonymous", async () => {
	const linkAccountFn = vi.fn();
	const { customFetchImpl, auth, sessionSetter, testUser } =
		await getTestInstance({
			plugins: [
				anonymous({
					async onLinkAccount(data) {
						linkAccountFn(data);
					},
					schema: {
						user: {
							fields: {
								isAnonymous: "is_anon",
							},
						},
					},
				}),
			],
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
				},
			},
		});
	const headers = new Headers();
	const client = createAuthClient({
		plugins: [anonymousClient()],
		fetchOptions: {
			customFetchImpl,
		},
		baseURL: "http://localhost:3000",
	});

	it("should sign in anonymously", async () => {
		await client.signIn.anonymous({
			fetchOptions: {
				onSuccess: sessionSetter(headers),
			},
		});
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.session).toBeDefined();
		expect(session.data?.user.isAnonymous).toBe(true);
	});

	it("link anonymous user account", async () => {
		expect(linkAccountFn).toHaveBeenCalledTimes(0);
		const res = await client.signIn.email(testUser, {
			headers,
		});
		expect(linkAccountFn).toHaveBeenCalledWith(expect.any(Object));
		linkAccountFn.mockClear();
	});

	it("should link in social sign on", async () => {
		const headers = new Headers();
		await client.signIn.anonymous({
			fetchOptions: {
				onSuccess: sessionSetter(headers),
			},
		});

		await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		const singInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/dashboard",
		});
		const state = new URL(singInRes.data?.url || "").searchParams.get("state");
		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			headers,
		});
		expect(linkAccountFn).toHaveBeenCalledWith(expect.any(Object));
	});

	it("should work with generateName", async () => {
		const { customFetchImpl, sessionSetter } = await getTestInstance({
			plugins: [
				anonymous({
					generateName() {
						return "i-am-anonymous";
					},
				}),
			],
		});
		const client = createAuthClient({
			plugins: [anonymousClient()],
			fetchOptions: {
				customFetchImpl,
			},
			baseURL: "http://localhost:3000",
		});
		const res = await client.signIn.anonymous({
			fetchOptions: {
				onSuccess: sessionSetter(headers),
			},
		});
		expect(res.data?.user.name).toBe("i-am-anonymous");
	});
});
