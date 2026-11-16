import { oauthProvider } from "@better-auth/oauth-provider";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import type { CibaNotification } from "./index";
import { CIBA_GRANT_TYPE, ciba } from "./index";
import type { CibaRequest } from "./schema";

const baseURL = "http://localhost:3000";

function createSecondaryStorage() {
	const store = new Map<string, string>();
	return {
		set(key: string, value: string) {
			store.set(key, value);
		},
		get(key: string) {
			return store.get(key) ?? null;
		},
		getAndDelete(key: string) {
			const value = store.get(key) ?? null;
			store.delete(key);
			return value;
		},
		increment(key: string) {
			const count = Number(store.get(key) ?? 0) + 1;
			store.set(key, String(count));
			return count;
		},
		delete(key: string) {
			store.delete(key);
		},
	};
}

/**
 * The cookie cache serves a session for up to `maxAge` seconds after the
 * store revoked it, so an interaction request must not trust it to decide.
 *
 * @see https://github.com/better-auth/better-auth/pull/12198
 */
describe.each([
	["the database session store", false],
	["a secondary session store", true],
])("ciba approval from a cached session on %s", async (_, secondary) => {
	let notification: CibaNotification | undefined;
	const { auth, client, customFetchImpl, signInWithTestUser, testUser } =
		await getTestInstance({
			baseURL,
			session: {
				cookieCache: { enabled: true, maxAge: 60 },
				storeSessionInDatabase: true,
			},
			secondaryStorage: secondary ? createSecondaryStorage() : undefined,
			plugins: [
				jwt({ jwt: { issuer: baseURL } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					allowDynamicClientRegistration: true,
				}),
				ciba({
					resultPage: "/ciba",
					interval: 1,
					sendNotification: (value) => {
						notification = value;
					},
				}),
			],
		});

	/** Signs in and fills the cookie cache, as a browser that loaded a page. */
	async function signIn() {
		const { headers } = await signInWithTestUser();
		const current = await client.getSession({
			fetchOptions: {
				headers,
				onSuccess(context) {
					const cookie = context.response.headers.get("set-cookie") ?? "";
					const cached = /better-auth\.session_data=[^;]+/.exec(cookie)?.[0];
					if (cached) {
						headers.set("cookie", `${headers.get("cookie")}; ${cached}`);
					}
				},
			},
		});
		expect(headers.get("cookie")).toContain("better-auth.session_data=");
		return { headers, token: current.data!.session.token };
	}

	async function revoke(token: string) {
		await (await auth.$context).internalAdapter.deleteSession(token);
	}

	async function redirectOf(
		url: string,
		headers: Headers,
		body?: Record<string, unknown>,
	) {
		const requestHeaders = new Headers(headers);
		requestHeaders.set("accept", "application/json");
		if (body) requestHeaders.set("content-type", "application/json");
		const res = await customFetchImpl(url, {
			method: body ? "POST" : "GET",
			headers: requestHeaders,
			body: body ? JSON.stringify(body) : undefined,
		});
		const json = (await res.json()) as { url?: string };
		if (!json.url) throw new Error(`No redirect from ${url}: ${res.status}`);
		return new URL(json.url, baseURL);
	}

	const answer = (consent: URL, accept: boolean, headers: Headers) =>
		redirectOf(`${baseURL}/api/auth/oauth2/consent`, headers, {
			accept,
			oauth_query: consent.search.slice(1),
		});

	/** Starts a request and returns the consent page its link leads to. */
	async function startRequest(headers: Headers) {
		const { client_id, client_secret } = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				client_name: "Support Agent",
				grant_types: [CIBA_GRANT_TYPE],
				metadata: { backchannel_token_delivery_mode: "poll" },
			},
		});
		const res = await customFetchImpl(
			`${baseURL}/api/auth/oauth2/bc-authorize`,
			{
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					authorization: `Basic ${btoa(`${client_id}:${client_secret}`)}`,
				},
				body: new URLSearchParams({
					scope: "openid",
					login_hint: testUser.email,
				}).toString(),
			},
		);
		expect(res.status).toBe(200);
		const { auth_req_id } = (await res.json()) as { auth_req_id: string };
		return {
			requestId: notification!.requestId,
			consent: await redirectOf(notification!.url, headers),
			poll: async () => {
				await new Promise((resolve) => setTimeout(resolve, 1050));
				const polled = await customFetchImpl(
					`${baseURL}/api/auth/oauth2/token`,
					{
						method: "POST",
						headers: {
							"content-type": "application/x-www-form-urlencoded",
							authorization: `Basic ${btoa(`${client_id}:${client_secret}`)}`,
						},
						body: new URLSearchParams({
							grant_type: CIBA_GRANT_TYPE,
							auth_req_id,
						}).toString(),
					},
				);
				return { status: polled.status, body: await polled.json() };
			},
		};
	}

	async function statusOf(requestId: string) {
		const row = await (await auth.$context).adapter.findOne<CibaRequest>({
			model: "cibaRequest",
			where: [{ field: "id", value: requestId }],
		});
		return row?.status;
	}

	it("does not approve after the session was revoked in the store", async () => {
		const { headers, token } = await signIn();
		const request = await startRequest(headers);
		await revoke(token);

		const result = await answer(request.consent, true, headers);

		expect(result.searchParams.get("status")).toBeNull();
		expect(result.searchParams.get("error")).toEqual(expect.any(String));
		expect(await statusOf(request.requestId)).toBe("pending");
		expect((await request.poll()).body.error).toBe("authorization_pending");
	});

	it("does not deny after the session was revoked in the store", async () => {
		const { headers, token } = await signIn();
		const request = await startRequest(headers);
		await revoke(token);

		const result = await answer(request.consent, false, headers);

		expect(result.searchParams.get("status")).toBeNull();
		expect(await statusOf(request.requestId)).toBe("pending");
	});

	it("revokes one session without affecting the user's other sessions", async () => {
		const first = await signIn();
		const second = await signIn();
		const request = await startRequest(second.headers);
		await revoke(first.token);

		const refused = await answer(request.consent, true, first.headers);
		expect(refused.searchParams.get("status")).toBeNull();
		expect(await statusOf(request.requestId)).toBe("pending");

		const approved = await answer(request.consent, true, second.headers);
		expect(approved.toString()).toBe(`${baseURL}/ciba?status=approved`);
		expect((await request.poll()).status).toBe(200);
	});
});
