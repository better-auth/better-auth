import type { BetterAuthOptions } from "better-auth";
import { parseSetCookieHeader } from "better-auth/cookies";
import { bearer, multiSession } from "better-auth/plugins";
import { getTestInstance } from "better-auth/test";
import type { CryptoKey, JWK } from "jose";
import { CompactSign, exportJWK, generateKeyPair } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dbsc } from "../src";

const BASE = "http://localhost:3000/api/auth";
const ORIGIN = "http://localhost:3000";

type Algorithm = "ES256" | "RS256";

/** A browser cookie jar plus a device key, standing in for Chrome. */
async function createBrowser(alg: Algorithm = "ES256") {
	const { privateKey, publicKey } = await generateKeyPair(alg, {
		extractable: true,
	});
	const jar = new Map<string, string>();
	const browser = {
		jar,
		privateKey,
		publicJwk: await exportJWK(publicKey),
		cookieHeader: () =>
			[...jar].map(([name, value]) => `${name}=${value}`).join("; "),
		store(response: Response) {
			for (const [name, { value, "max-age": maxAge }] of parseSetCookieHeader(
				response.headers.get("set-cookie") ?? "",
			)) {
				if (value === "" || maxAge === 0) jar.delete(name);
				else jar.set(name, value);
			}
		},
		/** Signs with this device's key unless `key` overrides it. */
		sign(jti: string, key: { privateKey?: CryptoKey; jwk?: JWK } = {}) {
			return new CompactSign(new TextEncoder().encode(JSON.stringify({ jti })))
				.setProtectedHeader({
					alg,
					typ: "dbsc+jwt",
					...(key.jwk ? { jwk: key.jwk } : {}),
				})
				.sign(key.privateKey ?? privateKey);
		},
	};
	return browser;
}

type Browser = Awaited<ReturnType<typeof createBrowser>>;

function readRegistrationChallenge(response: Response) {
	const header = response.headers.get("secure-session-registration");
	return header ? (/challenge="([^"]+)"/.exec(header)?.[1] ?? null) : null;
}

function readRefreshChallenge(response: Response) {
	const header = response.headers.get("secure-session-challenge");
	return header ? (/^"([^"]+)"/.exec(header)?.[1] ?? null) : null;
}

async function setup(overrides: Partial<BetterAuthOptions> = {}) {
	const instance = await getTestInstance({
		plugins: [dbsc()],
		...overrides,
	});
	const { auth, testUser } = instance;

	async function send(
		browser: Browser,
		path: string,
		init: {
			method?: string;
			headers?: Record<string, string>;
			body?: unknown;
		} = {},
	) {
		const response = await auth.handler(
			new Request(`${BASE}${path}`, {
				method: init.method ?? "GET",
				headers: {
					origin: ORIGIN,
					"sec-fetch-site": "same-origin",
					cookie: browser.cookieHeader(),
					...(init.body ? { "content-type": "application/json" } : {}),
					...init.headers,
				},
				body: init.body ? JSON.stringify(init.body) : undefined,
			}),
		);
		browser.store(response);
		return response;
	}

	async function signIn(browser: Browser, headers?: Record<string, string>) {
		return send(browser, "/sign-in/email", {
			method: "POST",
			body: { email: testUser.email, password: testUser.password },
			headers,
		});
	}

	/** Chrome's registration request: a POST with no body. */
	async function register(browser: Browser, challenge: string) {
		return send(browser, "/dbsc/register", {
			method: "POST",
			headers: {
				"secure-session-response": await browser.sign(challenge, {
					jwk: browser.publicJwk,
				}),
			},
		});
	}

	async function refresh(
		browser: Browser,
		sessionIdentifier: string,
		proof?: string,
	) {
		return send(browser, "/dbsc/refresh", {
			method: "POST",
			headers: {
				"sec-secure-session-id": sessionIdentifier,
				...(proof ? { "secure-session-response": proof } : {}),
			},
		});
	}

	async function getSession(browser: Browser) {
		const response = await send(browser, "/get-session");
		return response.json();
	}

	async function signInAndBind(alg: Algorithm = "ES256") {
		const browser = await createBrowser(alg);
		const signInResponse = await signIn(browser);
		const challenge = readRegistrationChallenge(signInResponse)!;
		const registration = await register(browser, challenge);
		expect(registration.status).toBe(200);
		const instructions = await registration.json();
		return {
			nextChallenge: readRefreshChallenge(registration),
			browser,
			instructions,
			sessionIdentifier: instructions.session_identifier as string,
		};
	}

	return {
		...instance,
		send,
		signIn,
		register,
		refresh,
		getSession,
		signInAndBind,
	};
}

function boundCookieName(jar: Map<string, string>) {
	return [...jar.keys()].find(
		(name) => name.includes(".dbsc_") && !name.endsWith("dbsc_registration"),
	);
}

afterEach(() => {
	vi.useRealTimers();
});

describe("dbsc", () => {
	it("offers registration on a same-origin sign-in response", async () => {
		const { signIn } = await setup();
		const response = await signIn(await createBrowser());

		const header = response.headers.get("secure-session-registration");
		expect(header).toMatch(
			/^\(ES256 RS256\);path="\/api\/auth\/dbsc\/register";challenge="[^"]+"$/,
		);
	});

	it.each(["ES256", "RS256"] as const)(
		"registers a %s device key and returns session instructions",
		async (alg) => {
			const { signInAndBind, auth } = await setup();
			const { browser, instructions } = await signInAndBind(alg);

			const name = boundCookieName(browser.jar)!;
			expect(name).toMatch(/^better-auth\.dbsc_/);
			expect(instructions).toMatchObject({
				refresh_url: "/api/auth/dbsc/refresh",
				scope: { include_site: false },
				credentials: [
					{
						type: "cookie",
						name,
						attributes: "Path=/; HttpOnly; SameSite=Lax",
					},
				],
				allowed_refresh_initiators: [],
			});
			expect(instructions.session_identifier).toEqual(expect.any(String));

			const session = await auth.api.getSession({
				headers: new Headers({ cookie: browser.cookieHeader() }),
			});
			const stored = session?.session as { dbscPublicKey?: string | null };
			expect(JSON.parse(stored.dbscPublicKey!)).toMatchObject({
				kty: browser.publicJwk.kty,
			});
		},
	);

	it("accepts the session only together with its bound cookie", async () => {
		const { signInAndBind, getSession, auth } = await setup();
		const { browser } = await signInAndBind();
		expect(await getSession(browser)).not.toBeNull();

		const stolen = new Map(browser.jar);
		stolen.delete(boundCookieName(browser.jar)!);
		const stolenCookies = [...stolen].map(([n, v]) => `${n}=${v}`).join("; ");
		expect(
			await auth.api.getSession({
				headers: new Headers({ cookie: stolenCookies }),
			}),
		).toBeNull();
		await expect(
			auth.api.listSessions({
				headers: new Headers({ cookie: stolenCookies }),
			}),
		).rejects.toMatchObject({ statusCode: 401 });
	});

	it("rejects a copied session token on its own", async () => {
		const { signInAndBind, auth } = await setup();
		const { browser } = await signInAndBind();
		const session = await auth.api.getSession({
			headers: new Headers({ cookie: browser.cookieHeader() }),
		});

		const replay = await auth.handler(
			new Request(`${BASE}/get-session`, {
				headers: {
					cookie: `better-auth.session_token=${browser.jar.get("better-auth.session_token")}`,
				},
			}),
		);
		expect(await replay.json()).toBeNull();
		expect(session).not.toBeNull();
	});

	it("still enforces the binding when the cookie cache is on", async () => {
		const { signInAndBind, auth } = await setup({
			session: { cookieCache: { enabled: true, maxAge: 300 } },
		});
		const { browser } = await signInAndBind();
		expect(browser.jar.has("better-auth.session_data")).toBe(true);

		const stolen = new Map(browser.jar);
		stolen.delete(boundCookieName(browser.jar)!);
		const cookie = [...stolen].map(([n, v]) => `${n}=${v}`).join("; ");
		expect(
			await auth.api.getSession({ headers: new Headers({ cookie }) }),
		).toBeNull();
	});

	it("renews the bound cookie with the challenge sent ahead of time", async () => {
		const { signInAndBind, refresh, getSession } = await setup();
		const { browser, sessionIdentifier, nextChallenge } = await signInAndBind();
		expect(nextChallenge).toEqual(expect.any(String));
		const name = boundCookieName(browser.jar)!;
		const previous = browser.jar.get(name);

		const response = await refresh(
			browser,
			sessionIdentifier,
			await browser.sign(nextChallenge!),
		);
		expect(response.status).toBe(200);
		expect(readRefreshChallenge(response)).not.toBe(nextChallenge);
		expect(browser.jar.get(name)).not.toBe(previous);
		expect(await getSession(browser)).not.toBeNull();
	});

	it("renews the bound cookie after the browser signs a new challenge", async () => {
		const { signInAndBind, refresh, getSession } = await setup();
		const { browser, sessionIdentifier } = await signInAndBind();
		const name = boundCookieName(browser.jar)!;
		const previous = browser.jar.get(name);

		const unsigned = await refresh(browser, sessionIdentifier);
		expect(unsigned.status).toBe(403);
		expect(unsigned.headers.get("secure-session-challenge")).toContain(
			`;id="${sessionIdentifier}"`,
		);
		const challenge = readRefreshChallenge(unsigned)!;

		const signed = await refresh(
			browser,
			sessionIdentifier,
			await browser.sign(challenge),
		);
		expect(signed.status).toBe(200);
		expect((await signed.json()).session_identifier).toBe(sessionIdentifier);
		expect(browser.jar.get(name)).not.toBe(previous);
		expect(await getSession(browser)).not.toBeNull();

		// A tab that still sends the previous cookie keeps working until it expires.
		browser.jar.set(name, previous!);
		expect(await getSession(browser)).not.toBeNull();
	});

	it("asks again instead of ending the session on a bad or replayed proof", async () => {
		const { signInAndBind, refresh } = await setup();
		const { browser, sessionIdentifier } = await signInAndBind();
		const challenge = readRefreshChallenge(
			await refresh(browser, sessionIdentifier),
		)!;
		const proof = await browser.sign(challenge);
		expect((await refresh(browser, sessionIdentifier, proof)).status).toBe(200);

		const replayed = await refresh(browser, sessionIdentifier, proof);
		expect(replayed.status).toBe(403);
		expect(readRefreshChallenge(replayed)).not.toBe(challenge);

		const other = await createBrowser();
		const forged = await refresh(
			browser,
			sessionIdentifier,
			await other.sign(readRefreshChallenge(replayed)!),
		);
		expect(forged.status).toBe(403);
	});

	it("ends the browser's session when the session is gone", async () => {
		const { signInAndBind, refresh, send } = await setup();
		const { browser, sessionIdentifier } = await signInAndBind();
		await send(browser, "/sign-out", { method: "POST", body: {} });

		const response = await refresh(browser, sessionIdentifier);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			session_identifier: sessionIdentifier,
			continue: false,
		});

		const unknown = await refresh(browser, "not-a-session");
		expect(await unknown.json()).toEqual({
			session_identifier: "not-a-session",
			continue: false,
		});
	});

	it("rejects the bound cookie once it expires", async () => {
		const { signInAndBind, getSession } = await setup();
		const { browser } = await signInAndBind();
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(Date.now() + 601 * 1000);

		expect(await getSession(browser)).toBeNull();
	});

	it("refuses to register twice or with a used challenge", async () => {
		const { signIn, register } = await setup();
		const browser = await createBrowser();
		const challenge = readRegistrationChallenge(await signIn(browser))!;
		expect((await register(browser, challenge)).status).toBe(200);

		expect((await register(browser, challenge)).status).toBe(400);
		expect((await register(browser, "made-up")).status).toBe(400);
	});

	it("refuses registration when the key cannot be saved", async () => {
		const { signIn, register, getSession } = await setup({
			databaseHooks: {
				session: { update: { before: async () => false } },
			},
		});
		const browser = await createBrowser();
		const challenge = readRegistrationChallenge(await signIn(browser))!;

		const response = await register(browser, challenge);
		expect(response.status).toBe(400);
		expect(boundCookieName(browser.jar)).toBeUndefined();
		expect(await getSession(browser)).not.toBeNull();
	});

	it("rejects a registration proof with the wrong type or a private key", async () => {
		const { signIn, send } = await setup();
		const browser = await createBrowser();
		const challenge = readRegistrationChallenge(await signIn(browser))!;
		const wrongType = await new CompactSign(
			new TextEncoder().encode(JSON.stringify({ jti: challenge })),
		)
			.setProtectedHeader({ alg: "ES256", typ: "JWT", jwk: browser.publicJwk })
			.sign(browser.privateKey);
		const privateJwk = await exportJWK(browser.privateKey);
		const leaked = await browser.sign(challenge, { jwk: privateJwk });

		for (const proof of [wrongType, leaked]) {
			const response = await send(browser, "/dbsc/register", {
				method: "POST",
				headers: { "secure-session-response": proof },
			});
			expect(response.status).toBe(400);
		}
	});

	describe("signing out without the bound cookie", () => {
		async function signOut(
			auth: { handler: (request: Request) => Promise<Response> },
			headers: Record<string, string>,
		) {
			return auth.handler(
				new Request(`${BASE}/sign-out`, {
					method: "POST",
					headers: {
						origin: ORIGIN,
						"content-type": "application/json",
						...headers,
					},
					body: "{}",
				}),
			);
		}

		it("clears that browser's cookies but keeps the session", async () => {
			const { signInAndBind, getSession, auth } = await setup();
			const { browser } = await signInAndBind();
			const token = browser.jar.get("better-auth.session_token");

			const copied = await signOut(auth, {
				cookie: `better-auth.session_token=${token}`,
			});
			expect(copied.status).toBe(200);
			const cleared = parseSetCookieHeader(
				copied.headers.get("set-cookie") ?? "",
			);
			expect(cleared.get("better-auth.session_token")?.value).toBe("");
			expect(await getSession(browser)).not.toBeNull();

			const owner = await signOut(auth, { cookie: browser.cookieHeader() });
			expect(owner.status).toBe(200);
			expect(
				await auth.api.getSession({
					headers: new Headers({ cookie: browser.cookieHeader() }),
				}),
			).toBeNull();
		});

		it("keeps the session when the token is sent as a bearer token", async () => {
			const { signInAndBind, getSession, auth } = await setup({
				plugins: [dbsc(), bearer()],
			});
			const { browser } = await signInAndBind();
			const token = browser.jar.get("better-auth.session_token")!;

			const response = await signOut(auth, {
				authorization: `Bearer ${decodeURIComponent(token)}`,
			});
			expect(response.status).toBe(200);
			expect(await getSession(browser)).not.toBeNull();
		});

		it("keeps the session when the token is sent as a multi-session cookie", async () => {
			const { signInAndBind, getSession, auth } = await setup({
				plugins: [dbsc(), multiSession()],
			});
			const { browser } = await signInAndBind();
			const token = browser.jar.get("better-auth.session_token")!;
			const plain = decodeURIComponent(token).split(".")[0]!.toLowerCase();

			const response = await signOut(auth, {
				cookie: `better-auth.session_token_multi-${plain}=${token}`,
			});
			expect(response.status).toBe(200);
			expect(await getSession(browser)).not.toBeNull();
		});
	});

	it("does not offer registration when a sign-in cookie is only re-issued", async () => {
		const { signIn, send } = await setup();
		const browser = await createBrowser();
		await signIn(browser);

		const updated = await send(browser, "/update-user", {
			method: "POST",
			body: { name: "Renamed" },
		});
		expect(updated.status).toBe(200);
		expect(updated.headers.get("secure-session-registration")).toBeNull();
	});

	it("leaves unbound sessions working", async () => {
		const { signIn, getSession } = await setup();
		const browser = await createBrowser();
		await signIn(browser);

		expect(await getSession(browser)).not.toBeNull();
	});

	it("does not offer registration to non-browser clients", async () => {
		const { auth, testUser } = await setup();
		const response = await auth.handler(
			new Request(`${BASE}/sign-in/email`, {
				method: "POST",
				headers: { origin: ORIGIN, "content-type": "application/json" },
				body: JSON.stringify({
					email: testUser.email,
					password: testUser.password,
				}),
			}),
		);

		expect(response.headers.get("secure-session-registration")).toBeNull();
		expect(response.headers.get("set-cookie")).not.toContain(
			"dbsc_registration",
		);
	});

	it("defers the offer for a server-side sign-in to the next browser request", async () => {
		const { auth, testUser, send, register } = await setup();
		const browser = await createBrowser();
		const signedIn = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			headers: new Headers({ "sec-fetch-site": "same-origin" }),
			asResponse: true,
		});
		expect(signedIn.headers.get("secure-session-registration")).toBeNull();
		browser.store(signedIn);
		expect(browser.jar.has("better-auth.dbsc_registration")).toBe(true);

		const next = await send(browser, "/get-session");
		const challenge = readRegistrationChallenge(next)!;
		expect(challenge).toEqual(expect.any(String));
		expect(browser.jar.has("better-auth.dbsc_registration")).toBe(false);
		expect((await register(browser, challenge)).status).toBe(200);
	});

	it("lets pages on trusted hosts of the same site trigger a refresh", async () => {
		const { signInAndBind } = await setup({
			trustedOrigins: [
				"http://app.localhost:3001",
				"*.localhost",
				"https://appleid.apple.com",
			],
		});
		const { instructions } = await signInAndBind();

		expect(instructions.allowed_refresh_initiators).toEqual([
			"app.localhost",
			"*.localhost",
		]);
	});

	it("works with secondary storage", async () => {
		const store = new Map<string, string>();
		const { signInAndBind, getSession, auth } = await setup({
			secondaryStorage: {
				get: (key) => store.get(key) ?? null,
				set: (key, value) => {
					store.set(key, value);
				},
				getAndDelete: (key) => {
					const value = store.get(key) ?? null;
					store.delete(key);
					return value;
				},
				increment: (key) => {
					const count = Number(store.get(key) ?? 0) + 1;
					store.set(key, String(count));
					return count;
				},
				delete: (key) => {
					store.delete(key);
				},
			},
		});
		const { browser } = await signInAndBind();
		expect(await getSession(browser)).not.toBeNull();

		const token = browser.jar.get("better-auth.session_token");
		expect(
			await auth.api.getSession({
				headers: new Headers({ cookie: `better-auth.session_token=${token}` }),
			}),
		).toBeNull();
	});

	it("rejects unsupported configurations at startup", async () => {
		expect(() => dbsc({ boundCookieMaxAge: 120 })).toThrow(/at least 300/);
		await expect(
			getTestInstance({
				plugins: [dbsc()],
				advanced: { defaultCookieAttributes: { partitioned: true } },
			}),
		).rejects.toThrow(/partitioned/);
		await expect(
			getTestInstance({
				plugins: [dbsc()],
				advanced: {
					crossSubDomainCookies: { enabled: true, domain: "example.com" },
				},
			}),
		).rejects.toThrow(/crossSubDomainCookies/);
	});
});
