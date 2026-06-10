import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@better-fetch/fetch", () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";

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

/**
 * Routes the two Graph calls (`debug_token` then `/me`) the access-token path
 * makes, based on the request URL.
 */
function mockGraph(opts: {
	debug?: ReturnType<typeof debugTokenResponse>;
	me?: ReturnType<typeof profileResponse>;
}) {
	mockedBetterFetch.mockImplementation(((url: unknown) => {
		const u = String(url);
		if (u.includes("debug_token")) {
			return Promise.resolve(
				opts.debug ??
					({ data: null, error: { message: "no debug mock" } } as any),
			);
		}
		return Promise.resolve(
			opts.me ?? ({ data: null, error: { message: "no /me mock" } } as any),
		);
	}) as unknown as typeof betterFetch);
}

describe("facebook.verifyIdToken (opaque access token)", () => {
	beforeEach(() => {
		mockedBetterFetch.mockReset();
	});

	it("accepts an opaque token bound to the configured app", async () => {
		mockGraph({
			debug: debugTokenResponse({
				is_valid: true,
				app_id: "fb-app",
				user_id: "u1",
			}),
		});
		const provider = facebook(options);
		await expect(
			provider.verifyIdToken("opaque-access-token", undefined),
		).resolves.toBe(true);
	});

	it("accepts a token bound to any configured client id", async () => {
		mockGraph({
			debug: debugTokenResponse({
				is_valid: true,
				app_id: "fb-mobile",
				user_id: "u1",
			}),
		});
		const provider = facebook({
			clientId: ["fb-app", "fb-mobile"],
			clientSecret: "fb-secret",
		});
		await expect(
			provider.verifyIdToken("opaque-access-token", undefined),
		).resolves.toBe(true);
	});

	it("rejects an opaque token issued to a different app", async () => {
		mockGraph({
			debug: debugTokenResponse({
				is_valid: true,
				app_id: "someone-elses-app",
				user_id: "u1",
			}),
		});
		const provider = facebook(options);
		await expect(
			provider.verifyIdToken("foreign-app-token", undefined),
		).resolves.toBe(false);
	});

	it("rejects an invalid opaque token", async () => {
		mockGraph({
			debug: debugTokenResponse({
				is_valid: false,
				app_id: "fb-app",
				user_id: "u1",
			}),
		});
		const provider = facebook(options);
		await expect(
			provider.verifyIdToken("revoked-token", undefined),
		).resolves.toBe(false);
	});

	it("rejects when no client secret is configured", async () => {
		mockGraph({
			debug: debugTokenResponse({
				is_valid: true,
				app_id: "fb-app",
				user_id: "u1",
			}),
		});
		const provider = facebook({ clientId: "fb-app", clientSecret: "" });
		await expect(
			provider.verifyIdToken("opaque-access-token", undefined),
		).resolves.toBe(false);
	});
});

describe("facebook.getUserInfo (opaque access token)", () => {
	beforeEach(() => {
		mockedBetterFetch.mockReset();
	});

	it("returns the profile for a token bound to the configured app", async () => {
		mockGraph({
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
		expect(res?.user.id).toBe("u1");
		expect(res?.user.email).toBe("u1@example.com");
	});

	it("rejects a token issued to a different app (token substitution)", async () => {
		mockGraph({
			debug: debugTokenResponse({
				is_valid: true,
				app_id: "someone-elses-app",
				user_id: "other-user",
			}),
			me: profileResponse(fbProfile("other-user")),
		});
		const provider = facebook(options);
		const res = await provider.getUserInfo({
			accessToken: "foreign-app-token",
		} as any);
		expect(res).toBeNull();
	});

	it("rejects when the profile id does not match the validated token", async () => {
		mockGraph({
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
	});

	it("rejects when no access token is supplied", async () => {
		mockGraph({});
		const provider = facebook(options);
		const res = await provider.getUserInfo({} as any);
		expect(res).toBeNull();
		expect(mockedBetterFetch).not.toHaveBeenCalled();
	});
});
