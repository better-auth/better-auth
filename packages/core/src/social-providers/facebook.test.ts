import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@better-fetch/fetch", () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";

import { verifyProviderIdToken } from "../oauth2/verify-id-token";
import { facebook } from "./facebook";

const mockedBetterFetch = vi.mocked(betterFetch);

const options = {
	clientId: "fb-app",
	clientSecret: "fb-secret",
};

function debugTokenResponse(data: {
	is_valid?: boolean;
	app_id?: string;
	user_id?: string;
}) {
	return { data: { data }, error: null } as Awaited<
		ReturnType<typeof betterFetch>
	>;
}

function profileResponse(profile: Record<string, unknown>) {
	return { data: profile, error: null } as Awaited<
		ReturnType<typeof betterFetch>
	>;
}

function fbProfile(id: string, email = `${id}@example.com`) {
	return {
		id,
		name: `User ${id}`,
		email,
		picture: {
			data: { url: "https://x", height: 100, width: 100, is_silhouette: false },
		},
	};
}

function mockGraphResponses(responses: {
	debug?: ReturnType<typeof debugTokenResponse>;
	me?: ReturnType<typeof profileResponse>;
}) {
	const graphFetch = vi.when(mockedBetterFetch, { onUnmatched: "throw" });
	if (responses.debug) {
		graphFetch
			.calledWith("https://graph.facebook.com/debug_token", expect.anything())
			.thenResolve(responses.debug, { times: 1 });
	}
	if (responses.me) {
		graphFetch
			.calledWith(
				"https://graph.facebook.com/me?fields=id,name,email,picture",
				expect.anything(),
			)
			.thenResolve(responses.me, { times: 1 });
	}
	return graphFetch;
}

describe("facebook.getUserInfo (opaque access token)", () => {
	beforeEach(() => {
		mockedBetterFetch.mockReset();
	});

	it("returns the profile for a token bound to the configured app", async () => {
		const graphFetch = mockGraphResponses({
			debug: debugTokenResponse({
				is_valid: true,
				app_id: "fb-app",
				user_id: "u1",
			}),
			me: profileResponse(fbProfile("u1")),
		});
		const provider = facebook(options);
		const res = await provider.getUserInfo({
			accessToken: "opaque-access-token",
		} as any);
		expect(res?.user).not.toHaveProperty("id");
		expect(res?.user.email).toBe("u1@example.com");
		expect(graphFetch).toHaveBeenExhausted();
		expect(typeof provider.accountSubject).toBe("function");
		if (typeof provider.accountSubject !== "function" || !res) return;
		expect(
			await provider.accountSubject({
				tokens: { accessToken: "opaque-access-token" },
				profile: res.data,
			}),
		).toBe("u1");
	});

	it("rejects a token issued to a different app (token substitution)", async () => {
		const graphFetch = mockGraphResponses({
			debug: debugTokenResponse({
				is_valid: true,
				app_id: "someone-elses-app",
				user_id: "other-user",
			}),
		});
		const provider = facebook(options);
		const res = await provider.getUserInfo({
			accessToken: "foreign-app-token",
		} as any);
		expect(res).toBeNull();
		expect(graphFetch).toHaveBeenExhausted();
	});

	it("rejects when the profile id does not match the validated token", async () => {
		const graphFetch = mockGraphResponses({
			debug: debugTokenResponse({
				is_valid: true,
				app_id: "fb-app",
				user_id: "u1",
			}),
			me: profileResponse(fbProfile("a-different-user")),
		});
		const provider = facebook(options);
		const res = await provider.getUserInfo({
			accessToken: "opaque-access-token",
		} as any);
		expect(res).toBeNull();
		expect(graphFetch).toHaveBeenExhausted();
	});

	it("rejects when no access token is supplied", async () => {
		const provider = facebook(options);
		const res = await provider.getUserInfo({} as any);
		expect(res).toBeNull();
		expect(mockedBetterFetch).not.toHaveBeenCalled();
	});
});

describe("facebook custom getUserInfo on client id_token sign-in", () => {
	const expectDebugTokenInput = (inputToken: string) =>
		expect(mockedBetterFetch).toHaveBeenCalledWith(
			"https://graph.facebook.com/debug_token",
			expect.objectContaining({
				query: expect.objectContaining({ input_token: inputToken }),
			}),
		);

	beforeEach(() => {
		mockedBetterFetch.mockReset();
	});

	it("does not resolve identity from an access token issued to another app", async () => {
		mockGraphResponses({
			debug: debugTokenResponse({
				is_valid: true,
				app_id: "someone-elses-app",
				user_id: "victim",
			}),
		});
		const getUserInfo = vi.fn().mockResolvedValue({
			user: { email: "victim@example.com", emailVerified: true },
			data: fbProfile("victim"),
		});
		const provider = facebook({ ...options, getUserInfo });

		const res = await provider.getUserInfo({
			idToken: "placeholder",
			accessToken: "foreign-app-token",
		});

		expect(res).toBeNull();
		expectDebugTokenInput("foreign-app-token");
		expect(getUserInfo).not.toHaveBeenCalled();
	});

	it.each([undefined, ""])(
		"checks the opaque id token when the access token is %j",
		async (accessToken) => {
			mockGraphResponses({
				debug: debugTokenResponse({
					is_valid: true,
					app_id: "someone-elses-app",
					user_id: "victim",
				}),
			});
			const getUserInfo = vi.fn();
			const provider = facebook({ ...options, getUserInfo });

			const res = await provider.getUserInfo({
				idToken: "foreign-app-token",
				accessToken,
			});

			expect(res).toBeNull();
			expectDebugTokenInput("foreign-app-token");
			expect(getUserInfo).not.toHaveBeenCalled();
		},
	);

	it("does not trust a foreign access token sent alongside a signed id token", async () => {
		mockGraphResponses({
			debug: debugTokenResponse({
				is_valid: true,
				app_id: "someone-elses-app",
				user_id: "victim",
			}),
		});
		const getUserInfo = vi.fn();
		const provider = facebook({ ...options, getUserInfo });

		const res = await provider.getUserInfo({
			idToken: "header.payload.signature",
			accessToken: "foreign-app-token",
		});

		expect(res).toBeNull();
		expectDebugTokenInput("foreign-app-token");
		expect(getUserInfo).not.toHaveBeenCalled();
	});

	it("passes a signed id token without an access token straight to a custom getUserInfo", async () => {
		mockGraphResponses({});
		const getUserInfo = vi.fn().mockResolvedValue({
			user: { email: "u1@example.com", emailVerified: false },
			data: { sub: "u1" },
		});
		const provider = facebook({ ...options, getUserInfo });

		await provider.getUserInfo({ idToken: "header.payload.signature" });

		expect(getUserInfo).toHaveBeenCalledOnce();
	});

	it("passes an access token bound to this app to a custom getUserInfo", async () => {
		mockGraphResponses({
			debug: debugTokenResponse({
				is_valid: true,
				app_id: "fb-app",
				user_id: "u1",
			}),
		});
		const getUserInfo = vi.fn().mockResolvedValue({
			user: { email: "u1@example.com", emailVerified: true },
			data: fbProfile("u1"),
		});
		const provider = facebook({ ...options, getUserInfo });

		await expect(verifyProviderIdToken(provider, "placeholder")).resolves.toBe(
			true,
		);
		await provider.getUserInfo({
			idToken: "placeholder",
			accessToken: "opaque-access-token",
		});

		expectDebugTokenInput("opaque-access-token");
		expect(getUserInfo).toHaveBeenCalledOnce();
	});
});
