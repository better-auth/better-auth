import { parseSetCookieHeader } from "better-auth/cookies";
import { multiSession } from "better-auth/plugins";
import { getTestInstance } from "better-auth/test";
import type { JWK } from "jose";
import { exportJWK, SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
import type { DbscEvent, DbscOptions } from ".";
import { dbsc } from ".";

const ORIGIN = "http://localhost:3000";
const BASE = `${ORIGIN}/api/auth`;
// Each session gets its own bound cookie, suffixed from its token hash.
const BOUND_COOKIE = "better-auth.dbsc_";
const boundName = (jar: Map<string, string>) =>
	[...jar.keys()].find((name) => name.startsWith(BOUND_COOKIE));
const SESSION_COOKIE = "better-auth.session_token";

/**
 * Plays Chrome's side of DBSC: holds a cookie jar and a per-session key, and
 * follows the protocol headers the way the measured browser does.
 */
async function createBrowser(handler: (request: Request) => Promise<Response>) {
	const jar = new Map<string, string>();
	const keyPair = await crypto.subtle.generateKey(
		{ name: "ECDSA", namedCurve: "P-256" },
		true,
		["sign", "verify"],
	);
	const jwk = await exportJWK(keyPair.publicKey);

	const send = async (
		path: string,
		init: {
			method?: string;
			headers?: Record<string, string>;
			body?: unknown;
			cookies?: boolean;
		} = {},
	) => {
		const headers = new Headers(init.headers);
		headers.set("origin", ORIGIN);
		if (init.body) headers.set("content-type", "application/json");
		if (init.cookies !== false && jar.size) {
			headers.set(
				"cookie",
				[...jar].map(([name, value]) => `${name}=${value}`).join("; "),
			);
		}
		const response = await handler(
			new Request(`${BASE}${path}`, {
				method: init.method ?? "POST",
				headers,
				body: init.body ? JSON.stringify(init.body) : undefined,
			}),
		);
		for (const [name, cookie] of parseSetCookieHeader(
			response.headers.get("set-cookie") ?? "",
		)) {
			if (cookie["max-age"] === 0 || !cookie.value) jar.delete(name);
			else jar.set(name, cookie.value);
		}
		return response;
	};

	const prove = (
		challenge: string,
		options: {
			withKey?: boolean;
			key?: CryptoKey;
			jwk?: JWK;
			typ?: string;
		} = {},
	) =>
		new SignJWT({ jti: challenge })
			.setProtectedHeader({
				alg: "ES256",
				typ: options.typ ?? "dbsc+jwt",
				...(options.withKey && { jwk: options.jwk ?? jwk }),
			})
			.sign(options.key ?? keyPair.privateKey);

	return { jar, send, prove, jwk };
}

function readChallenge(response: Response) {
	const header = response.headers.get("secure-session-challenge") ?? "";
	const match = /^"([^"]+)";id="([^"]+)"$/.exec(header);
	return match ? { challenge: match[1]!, id: match[2]! } : null;
}

function readRegistration(response: Response) {
	const header = response.headers.get("secure-session-registration") ?? "";
	const match = /^\(([^)]*)\);path="([^"]+)";challenge="([^"]+)"$/.exec(header);
	return match
		? { algorithms: match[1]!, path: match[2]!, challenge: match[3]! }
		: null;
}

async function setup(options?: DbscOptions) {
	const events: DbscEvent[] = [];
	const instance = await getTestInstance({
		plugins: [
			dbsc({
				...options,
				onEvent: (event) => {
					events.push(event);
				},
			}),
		],
	});
	const browser = await createBrowser(instance.auth.handler);
	const signIn = () =>
		browser.send("/sign-in/email", {
			body: {
				email: instance.testUser.email,
				password: instance.testUser.password,
			},
		});
	// Registers the way Chrome does after a sign-in: POST the signed ticket.
	const signInAndRegister = async () => {
		const offer = readRegistration(await signIn());
		const registered = await browser.send("/dbsc/register", {
			headers: {
				"secure-session-response": await browser.prove(offer!.challenge, {
					withKey: true,
				}),
			},
		});
		return { offer: offer!, registered };
	};
	const refresh = (id: string, proof?: string, cookies?: boolean) =>
		browser.send("/dbsc/refresh", {
			headers: {
				"sec-secure-session-id": id,
				...(proof && { "secure-session-response": proof }),
			},
			cookies,
		});
	return { ...instance, browser, events, signIn, signInAndRegister, refresh };
}

describe("dbsc", () => {
	it("offers registration on a sign-in response", async () => {
		const { signIn } = await setup();
		const offer = readRegistration(await signIn());
		expect(offer).toMatchObject({
			algorithms: "ES256 RS256",
			path: "/api/auth/dbsc/register",
		});
	});

	it("does not offer registration when shouldOffer declines", async () => {
		const { signIn } = await setup({ shouldOffer: () => false });
		expect(readRegistration(await signIn())).toBeNull();
	});

	it("does not offer registration when an existing session's cookie is re-issued", async () => {
		const { browser, signIn } = await setup();
		await signIn();
		// A stolen cookie replayed here must not earn a ticket, or the thief
		// could bind the session to their own key.
		const response = await browser.send("/update-user", {
			body: { name: "renamed" },
		});
		expect(response.status).toBe(200);
		expect(response.headers.get("set-cookie")).toContain(SESSION_COOKIE);
		expect(readRegistration(response)).toBeNull();
	});

	it("lets the refresh initiators be narrowed", async () => {
		const { signInAndRegister } = await setup({
			allowedRefreshInitiators: ["app.example.com"],
		});
		const { registered } = await signInAndRegister();
		expect(await registered.json()).toMatchObject({
			allowed_refresh_initiators: ["app.example.com"],
		});
	});

	it("removes bindings of sessions that expired long ago when the user registers", async () => {
		const { signIn, browser, db } = await setup();
		const offer = readRegistration(await signIn())!;
		const token = decodeURIComponent(browser.jar.get(SESSION_COOKIE)!).split(
			".",
		)[0]!;
		const session = await db.findOne<{ userId: string }>({
			model: "session",
			where: [{ field: "token", value: token }],
		});
		const day = 24 * 60 * 60 * 1000;
		const plant = (tokenHash: string, expiredFor: number) =>
			db.create({
				model: "dbscBinding",
				data: {
					tokenHash,
					userId: session!.userId,
					publicKey: "{}",
					algorithm: "ES256",
					thumbprint: tokenHash,
					lastChallengeAt: 0,
					expiresAt: new Date(Date.now() - expiredFor),
					createdAt: new Date(0),
					updatedAt: new Date(0),
				},
			});
		// Sessions last 7 days here: one row is past a whole lifetime, the
		// other may still belong to a session that was extended since.
		await plant("long-dead", 8 * day);
		await plant("recently-expired", day);

		await browser.send("/dbsc/register", {
			headers: {
				"secure-session-response": await browser.prove(offer.challenge, {
					withKey: true,
				}),
			},
		});
		const left = await db.findMany<{ tokenHash: string }>({
			model: "dbscBinding",
		});
		const hashes = left.map((row) => row.tokenHash);
		expect(hashes).not.toContain("long-dead");
		expect(hashes).toContain("recently-expired");
		expect(hashes).toHaveLength(2);
	});

	it("offers registration on the next request after a sign-in on the server", async () => {
		const { auth, testUser, browser } = await setup();
		// A server action signs in through auth.api: the browser never sees
		// that response's headers, only the cookies the framework forwards.
		const { headers } = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			returnHeaders: true,
		});
		expect(headers.get("secure-session-registration")).toBeNull();
		for (const [name, cookie] of parseSetCookieHeader(
			headers.get("set-cookie") ?? "",
		)) {
			browser.jar.set(name, cookie.value);
		}

		const next = await browser.send("/get-session", { method: "GET" });
		const offer = readRegistration(next);
		expect(offer).not.toBeNull();
		expect(browser.jar.has("better-auth.dbsc-offer")).toBe(false);
		const registered = await browser.send("/dbsc/register", {
			headers: {
				"secure-session-response": await browser.prove(offer!.challenge, {
					withKey: true,
				}),
			},
		});
		expect(registered.status).toBe(200);
		// Offered once.
		expect(
			readRegistration(await browser.send("/get-session", { method: "GET" })),
		).toBeNull();
	});

	it("registers with a ticket, without the session cookie", async () => {
		const { browser, signIn, events } = await setup();
		const offer = readRegistration(await signIn());
		// After an OAuth or SAML callback Chrome sends no Lax session cookie.
		const response = await browser.send("/dbsc/register", {
			headers: {
				"secure-session-response": await browser.prove(offer!.challenge, {
					withKey: true,
				}),
			},
			cookies: false,
		});
		expect(response.status).toBe(200);
		const config = await response.json();
		expect(config).toEqual({
			session_identifier: expect.any(String),
			refresh_url: "/api/auth/dbsc/refresh",
			scope: { include_site: false },
			credentials: [
				{
					type: "cookie",
					name: expect.stringMatching(/^better-auth\.dbsc_[\w-]{12}$/),
					attributes: "Path=/; HttpOnly; SameSite=Lax",
				},
			],
			allowed_refresh_initiators: ["*"],
		});
		expect(readChallenge(response)?.id).toBe(config.session_identifier);
		expect(boundName(browser.jar)).toBeTruthy();
		expect(events.map((event) => event.type)).toEqual(["registered"]);
	});

	it("refreshes in one round trip with the challenge from the last response", async () => {
		const { browser, signInAndRegister, refresh } = await setup();
		const { registered } = await signInAndRegister();
		const first = readChallenge(registered)!;
		browser.jar.delete(boundName(browser.jar)!);

		const response = await refresh(
			first.id,
			await browser.prove(first.challenge),
		);
		expect(response.status).toBe(200);
		expect(boundName(browser.jar)).toBeTruthy();
		expect(readChallenge(response)?.challenge).not.toBe(first.challenge);
	});

	it("moves the binding expiry with the session on refresh", async () => {
		const { browser, signInAndRegister, refresh, db } = await setup();
		const { registered } = await signInAndRegister();
		const { id, challenge } = readChallenge(registered)!;
		const extended = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
		const binding = await db.findOne<{ userId: string }>({
			model: "dbscBinding",
			where: [{ field: "id", value: id }],
		});
		await db.update({
			model: "session",
			where: [{ field: "userId", value: binding!.userId }],
			update: { expiresAt: extended },
		});

		expect((await refresh(id, await browser.prove(challenge))).status).toBe(
			200,
		);
		const refreshed = await db.findOne<{ expiresAt: Date }>({
			model: "dbscBinding",
			where: [{ field: "id", value: id }],
		});
		expect(new Date(refreshed!.expiresAt).getTime()).toBe(extended.getTime());
	});

	it("asks for a proof with a 403 and a challenge", async () => {
		const { browser, signInAndRegister, refresh } = await setup();
		const { registered } = await signInAndRegister();
		const { id } = readChallenge(registered)!;

		const asked = await refresh(id);
		expect(asked.status).toBe(403);
		const { challenge } = readChallenge(asked)!;
		const answered = await refresh(id, await browser.prove(challenge));
		expect(answered.status).toBe(200);
	});

	it("accepts each challenge once", async () => {
		const { browser, signInAndRegister, refresh } = await setup();
		const { registered } = await signInAndRegister();
		const { id, challenge } = readChallenge(registered)!;
		const proof = await browser.prove(challenge);

		expect((await refresh(id, proof)).status).toBe(200);
		const replayed = await refresh(id, proof);
		expect(replayed.status).toBe(403);
		expect(readChallenge(replayed)).not.toBeNull();
	});

	it("lets only one of two concurrent refreshes consume a challenge", async () => {
		const { browser, signInAndRegister, refresh } = await setup();
		const { registered } = await signInAndRegister();
		const { id, challenge } = readChallenge(registered)!;
		const proof = await browser.prove(challenge);

		const statuses = await Promise.all([
			refresh(id, proof),
			refresh(id, proof),
		]);
		expect(statuses.map((response) => response.status).sort()).toEqual([
			200, 403,
		]);
	});

	it("answers a challenge issued for another binding with a fresh challenge", async () => {
		const first = await setup();
		const a = readChallenge((await first.signInAndRegister()).registered)!;
		const other = await createBrowser(first.auth.handler);
		const offer = readRegistration(
			await other.send("/sign-in/email", {
				body: {
					email: first.testUser.email,
					password: first.testUser.password,
				},
			}),
		)!;
		const b = readChallenge(
			await other.send("/dbsc/register", {
				headers: {
					"secure-session-response": await other.prove(offer.challenge, {
						withKey: true,
					}),
				},
			}),
		)!;

		const response = await first.refresh(
			a.id,
			await first.browser.prove(b.challenge),
		);
		expect(response.status).toBe(403);
	});

	it("issues a usable challenge when the clock runs behind the last one", async () => {
		const { browser, signInAndRegister, refresh } = await setup();
		const { registered } = await signInAndRegister();
		const { id, challenge } = readChallenge(registered)!;
		expect((await refresh(id, await browser.prove(challenge))).status).toBe(
			200,
		);

		// Another instance, five seconds behind, answers from here on.
		vi.useFakeTimers({ now: Date.now() - 5000, toFake: ["Date"] });
		const asked = await refresh(id);
		const answered = await refresh(
			id,
			await browser.prove(readChallenge(asked)!.challenge),
		);
		vi.useRealTimers();
		expect(asked.status).toBe(403);
		expect(answered.status).toBe(200);
	});

	it("rejects a refresh proof that carries its own key", async () => {
		const { browser, signInAndRegister, refresh, events } = await setup();
		const { registered } = await signInAndRegister();
		const { id, challenge } = readChallenge(registered)!;

		const response = await refresh(
			id,
			await browser.prove(challenge, { withKey: true }),
		);
		expect(response.status).toBe(400);
		expect(events.at(-1)).toMatchObject({
			type: "rejected",
			reason: "unexpected_key",
		});
	});

	it("rejects a refresh proof signed by another key", async () => {
		const { browser, signInAndRegister, refresh } = await setup();
		const { registered } = await signInAndRegister();
		const { id, challenge } = readChallenge(registered)!;
		const attacker = await crypto.subtle.generateKey(
			{ name: "ECDSA", namedCurve: "P-256" },
			true,
			["sign", "verify"],
		);

		const response = await refresh(
			id,
			await browser.prove(challenge, { key: attacker.privateKey }),
		);
		expect(response.status).toBe(400);
	});

	it("rejects a ticket presented with another session's cookie", async () => {
		const { auth, testUser, signIn } = await setup();
		const victim = readRegistration(await signIn())!;
		const other = await createBrowser(auth.handler);
		await other.send("/sign-in/email", {
			body: { email: testUser.email, password: testUser.password },
		});
		const response = await other.send("/dbsc/register", {
			headers: {
				"secure-session-response": await other.prove(victim.challenge, {
					withKey: true,
				}),
			},
		});
		expect(response.status).toBe(400);
	});

	it("keeps pages and frames away from the refresh endpoint", async () => {
		const { signInAndRegister, refresh } = await setup();
		const { registered } = await signInAndRegister();
		const response = await refresh(readChallenge(registered)!.id);
		expect(response.headers.get("cross-origin-resource-policy")).toBe(
			"same-origin",
		);
		expect(response.headers.get("x-frame-options")).toBe("DENY");
	});

	it("refreshes on the proof alone when the session cookie is absent", async () => {
		const { browser, signInAndRegister, refresh } = await setup();
		const { registered } = await signInAndRegister();
		const { id, challenge } = readChallenge(registered)!;
		// A refresh started by a request from another site has no Lax cookie.
		const response = await refresh(id, await browser.prove(challenge), false);
		expect(response.status).toBe(200);
		expect(boundName(browser.jar)).toBeTruthy();
	});

	it("refreshes a session while the cookie names the browser's other session", async () => {
		const { auth, testUser, browser, signInAndRegister } = await setup();
		const { registered } = await signInAndRegister();
		const { id, challenge } = readChallenge(registered)!;
		// With multi-session the active cookie may belong to another session.
		const other = await createBrowser(auth.handler);
		await other.send("/sign-in/email", {
			body: { email: testUser.email, password: testUser.password },
		});
		const response = await other.send("/dbsc/refresh", {
			headers: {
				"sec-secure-session-id": id,
				"secure-session-response": await browser.prove(challenge),
			},
		});
		expect(response.status).toBe(200);
	});

	it("rejects a replayed registration ticket", async () => {
		const { auth, signInAndRegister, events } = await setup();
		const { offer } = await signInAndRegister();
		// Same ticket, another key: the session is already bound.
		const thief = await createBrowser(auth.handler);
		const response = await thief.send("/dbsc/register", {
			headers: {
				"secure-session-response": await thief.prove(offer.challenge, {
					withKey: true,
				}),
			},
		});
		expect(response.status).toBe(400);
		expect(events.at(-1)).toMatchObject({
			type: "rejected",
			reason: "already_bound",
		});
	});

	it("ends the browser session once the auth session is gone", async () => {
		const { browser, signInAndRegister, refresh, events } = await setup();
		const { registered } = await signInAndRegister();
		const { id } = readChallenge(registered)!;

		await browser.send("/sign-out");
		const response = await refresh(id);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			session_identifier: id,
			continue: false,
		});
		expect(events.at(-1)).toMatchObject({ type: "ended" });
	});

	it("only challenges a refresh that has neither proof nor session cookie", async () => {
		const { browser, signInAndRegister, refresh } = await setup();
		const { registered } = await signInAndRegister();
		const { id, challenge } = readChallenge(registered)!;

		const stranger = await refresh(id, undefined, false);
		expect(stranger.status).toBe(403);
		const owner = await refresh(id, await browser.prove(challenge));
		expect(owner.status).toBe(200);
	});

	it("never answers the protocol endpoints with 429", async () => {
		const instance = await getTestInstance({
			plugins: [dbsc()],
			rateLimit: { enabled: true, window: 60, max: 2 },
		});
		const browser = await createBrowser(instance.auth.handler);
		const statuses = await Promise.all(
			Array.from({ length: 5 }, () =>
				browser.send("/dbsc/refresh", {
					headers: { "sec-secure-session-id": "missing" },
				}),
			),
		);
		expect(statuses.map((response) => response.status)).not.toContain(429);
	});

	it("skips the origin check, whose 403 would delete the Chrome session", async () => {
		const { auth } = await getTestInstance({
			plugins: [dbsc()],
			advanced: { disableOriginCheck: false },
		});
		const response = await auth.handler(
			new Request(`${BASE}/dbsc/refresh`, {
				method: "POST",
				headers: {
					cookie: `${SESSION_COOKIE}=x`,
					"sec-secure-session-id": "missing",
				},
			}),
		);
		expect(response.status).toBe(200);
	});

	it("reports skipped refreshes to onEvent", async () => {
		const { auth, events } = await setup();
		await auth.handler(
			new Request(`${BASE}/get-session`, {
				headers: {
					"secure-session-skipped":
						'quota_exceeded;session_identifier="abc", server_error;session_identifier="def"',
				},
			}),
		);
		expect(events).toEqual([
			{ type: "skipped", reason: "quota_exceeded", bindingId: "abc" },
			{ type: "skipped", reason: "server_error", bindingId: "def" },
		]);
	});

	it("caps the skipped refreshes it reports from one request", async () => {
		const { auth, events } = await setup();
		await auth.handler(
			new Request(`${BASE}/get-session`, {
				headers: {
					"secure-session-skipped": Array.from(
						{ length: 1000 },
						() => "unreachable",
					).join(", "),
				},
			}),
		);
		expect(events).toHaveLength(4);
	});

	it("binds and refreshes when sessions live only in secondary storage", async () => {
		const store = new Map<string, string>();
		const instance = await getTestInstance({
			plugins: [dbsc()],
			secondaryStorage: {
				get: (key) => store.get(key) ?? null,
				set: (key, value) => void store.set(key, value),
				delete: (key) => void store.delete(key),
				getAndDelete: (key) => {
					const value = store.get(key) ?? null;
					store.delete(key);
					return value;
				},
				increment: (key) => {
					const next = Number(store.get(key) ?? 0) + 1;
					store.set(key, String(next));
					return next;
				},
			},
		});
		const browser = await createBrowser(instance.auth.handler);
		const offer = readRegistration(
			await browser.send("/sign-in/email", {
				body: {
					email: instance.testUser.email,
					password: instance.testUser.password,
				},
			}),
		);
		expect(offer).not.toBeNull();
		const registered = await browser.send("/dbsc/register", {
			headers: {
				"secure-session-response": await browser.prove(offer!.challenge, {
					withKey: true,
				}),
			},
			cookies: false,
		});
		expect(registered.status).toBe(200);
		const { id, challenge } = readChallenge(registered)!;
		const refreshed = await browser.send("/dbsc/refresh", {
			headers: {
				"sec-secure-session-id": id,
				"secure-session-response": await browser.prove(challenge),
			},
		});
		expect(refreshed.status).toBe(200);
	});

	describe("enforce", () => {
		const GRACE = 11_000;
		const getSession = async (
			browser: Awaited<ReturnType<typeof createBrowser>>,
		) => (await browser.send("/get-session", { method: "GET" })).json();
		// A thief's browser: the long-lived session cookie, nothing else.
		const copySession = async (
			auth: { handler: (request: Request) => Promise<Response> },
			from: Awaited<ReturnType<typeof createBrowser>>,
		) => {
			const thief = await createBrowser(auth.handler);
			thief.jar.set(SESSION_COOKIE, from.jar.get(SESSION_COOKIE)!);
			return thief;
		};

		it("treats a copied session cookie as signed out on every endpoint", async () => {
			const { auth, browser, signInAndRegister, events } = await setup({
				enforce: true,
			});
			await signInAndRegister();
			const thief = await copySession(auth, browser);
			vi.useFakeTimers({ now: Date.now() + GRACE, toFake: ["Date"] });
			const session = await getSession(thief);
			const update = await thief.send("/update-user", {
				body: { name: "thief" },
			});
			const sessions = await thief.send("/list-sessions", { method: "GET" });
			vi.useRealTimers();

			expect(session).toBeNull();
			expect(update.status).toBe(401);
			expect(sessions.status).toBe(401);
			expect(events.filter((event) => event.type === "blocked")).toHaveLength(
				3,
			);
		});

		it("accepts the session together with its fresh bound cookie", async () => {
			const { browser, signInAndRegister } = await setup({ enforce: true });
			await signInAndRegister();
			vi.useFakeTimers({ now: Date.now() + GRACE, toFake: ["Date"] });
			const session = await getSession(browser);
			vi.useRealTimers();
			expect(session).toMatchObject({ user: { email: "test@test.com" } });
		});

		it("rejects a bound cookie issued for another session", async () => {
			const first = await setup({ enforce: true });
			await first.signInAndRegister();
			const thief = await copySession(first.auth, first.browser);
			// The thief brings a valid bound cookie from a session of their own.
			const own = await createBrowser(first.auth.handler);
			const offer = readRegistration(
				await own.send("/sign-in/email", {
					body: {
						email: first.testUser.email,
						password: first.testUser.password,
					},
				}),
			)!;
			await own.send("/dbsc/register", {
				headers: {
					"secure-session-response": await own.prove(offer.challenge, {
						withKey: true,
					}),
				},
			});
			thief.jar.set(
				boundName(first.browser.jar)!,
				own.jar.get(boundName(own.jar)!)!,
			);
			vi.useFakeTimers({ now: Date.now() + GRACE, toFake: ["Date"] });
			const session = await getSession(thief);
			vi.useRealTimers();
			expect(session).toBeNull();
			expect(first.events.at(-1)).toMatchObject({
				type: "blocked",
				reason: "invalid",
				enforced: true,
			});
		});

		it("leaves sessions that were never bound alone", async () => {
			const { auth, browser, signIn } = await setup({ enforce: true });
			await signIn();
			const copy = await copySession(auth, browser);
			vi.useFakeTimers({ now: Date.now() + GRACE, toFake: ["Date"] });
			const session = await getSession(copy);
			vi.useRealTimers();
			expect(session).not.toBeNull();
		});

		it("allows requests already in flight when registration completes", async () => {
			const { auth, browser, signInAndRegister } = await setup({
				enforce: true,
			});
			await signInAndRegister();
			const racing = await copySession(auth, browser);
			expect(await getSession(racing)).not.toBeNull();
		});

		it("still lets a stale session refresh", async () => {
			const { browser, signInAndRegister, refresh } = await setup({
				enforce: true,
			});
			const { registered } = await signInAndRegister();
			const { id, challenge } = readChallenge(registered)!;
			browser.jar.delete(boundName(browser.jar)!);
			vi.useFakeTimers({ now: Date.now() + GRACE, toFake: ["Date"] });
			const response = await refresh(id, await browser.prove(challenge));
			const session = await getSession(browser);
			vi.useRealTimers();
			expect(response.status).toBe(200);
			expect(session).not.toBeNull();
		});

		it("ignores a sign-out sent with a copied session cookie", async () => {
			const { auth, browser, signInAndRegister } = await setup({
				enforce: true,
			});
			await signInAndRegister();
			const thief = await copySession(auth, browser);
			vi.useFakeTimers({ now: Date.now() + GRACE, toFake: ["Date"] });
			await thief.send("/sign-out");
			const session = await getSession(browser);
			vi.useRealTimers();
			expect(session).not.toBeNull();
		});

		it("checks every session the multi-session plugin keeps in the browser", async () => {
			const events: DbscEvent[] = [];
			const { auth, testUser } = await getTestInstance({
				plugins: [
					multiSession(),
					dbsc({ enforce: true, onEvent: (event) => void events.push(event) }),
				],
			});
			const browser = await createBrowser(auth.handler);
			const signInAndRegister = async (path: string, body: unknown) => {
				const offer = readRegistration(await browser.send(path, { body }))!;
				// Chrome makes a new key for each session.
				const session = await createBrowser(auth.handler);
				const registered = await browser.send("/dbsc/register", {
					headers: {
						"secure-session-response": await session.prove(offer.challenge, {
							withKey: true,
						}),
					},
				});
				expect(registered.status).toBe(200);
			};
			await signInAndRegister("/sign-in/email", {
				email: testUser.email,
				password: testUser.password,
			});
			await signInAndRegister("/sign-up/email", {
				email: "second@test.com",
				password: "password123456",
				name: "Second",
			});
			const list = async (who: Awaited<ReturnType<typeof createBrowser>>) =>
				(
					await who.send("/multi-session/list-device-sessions", {
						method: "GET",
					})
				).json();

			// A copied jar: every session cookie, none of the bound cookies.
			const thief = await createBrowser(auth.handler);
			for (const [name, value] of browser.jar) {
				if (!name.startsWith(BOUND_COOKIE)) thief.jar.set(name, value);
			}
			vi.useFakeTimers({ now: Date.now() + GRACE, toFake: ["Date"] });
			const own = await list(browser);
			const copied = await list(thief);
			vi.useRealTimers();

			expect(own).toHaveLength(2);
			expect(copied).toEqual([]);
		});

		it("stops looking up a session that can no longer be bound", async () => {
			const { browser, signIn, db } = await setup({ enforce: true });
			await signIn();
			// Still young enough to register: nothing is remembered yet.
			await getSession(browser);
			expect(boundName(browser.jar)).toBeUndefined();

			vi.useFakeTimers({ now: Date.now() + 7 * 60_000, toFake: ["Date"] });
			await getSession(browser);
			const note = boundName(browser.jar);
			// A binding cannot appear for a session this old. Planting one shows
			// the next request is answered from the cookie, not the database.
			const token = decodeURIComponent(browser.jar.get(SESSION_COOKIE)!).split(
				".",
			)[0]!;
			const session = await db.findOne<{ token: string; userId: string }>({
				model: "session",
				where: [{ field: "token", value: token }],
			});
			const { hashToken } = await import("./routes");
			await db.create({
				model: "dbscBinding",
				data: {
					tokenHash: await hashToken(session!.token),
					userId: session!.userId,
					publicKey: "{}",
					algorithm: "ES256",
					thumbprint: "planted",
					lastChallengeAt: 0,
					expiresAt: new Date(Date.now() + 60_000),
					createdAt: new Date(0),
					updatedAt: new Date(0),
				},
			});
			const withNote = await getSession(browser);
			browser.jar.delete(note!);
			const withoutNote = await getSession(browser);
			vi.useRealTimers();

			expect(note).toBeDefined();
			expect(withNote).not.toBeNull();
			expect(withoutNote).toBeNull();
		});

		it("reports what it would block in monitor mode, and blocks nothing", async () => {
			const { auth, browser, signInAndRegister, events } = await setup({
				enforce: "monitor",
			});
			await signInAndRegister();
			const thief = await copySession(auth, browser);
			vi.useFakeTimers({ now: Date.now() + GRACE, toFake: ["Date"] });
			const session = await getSession(thief);
			vi.useRealTimers();
			expect(session).not.toBeNull();
			expect(events.at(-1)).toMatchObject({
				type: "blocked",
				reason: "missing",
				enforced: false,
			});
		});

		it("accepts a copied session cookie when enforcement is off", async () => {
			const { auth, browser, signInAndRegister } = await setup();
			await signInAndRegister();
			const thief = await copySession(auth, browser);
			vi.useFakeTimers({ now: Date.now() + GRACE, toFake: ["Date"] });
			const session = await getSession(thief);
			vi.useRealTimers();
			expect(session).not.toBeNull();
		});

		it("rejects a copied token presented through the bearer plugin", async () => {
			const { auth, browser, signInAndRegister } = await setup({
				enforce: true,
			});
			await signInAndRegister();
			const signed = decodeURIComponent(browser.jar.get(SESSION_COOKIE)!);
			vi.useFakeTimers({ now: Date.now() + GRACE, toFake: ["Date"] });
			const statuses = await Promise.all(
				[signed, signed.split(".")[0]!].map(async (token) => {
					const response = await auth.handler(
						new Request(`${BASE}/get-session`, {
							headers: { authorization: `Bearer ${token}` },
						}),
					);
					return response.status;
				}),
			);
			vi.useRealTimers();
			expect(statuses).toEqual([401, 401]);
		});
	});

	describe("getDbscState", () => {
		it("is unbound before registration", async () => {
			const { auth, browser, signIn } = await setup();
			await signIn();
			const headers = new Headers({
				cookie: `${SESSION_COOKIE}=${browser.jar.get(SESSION_COOKIE)}`,
			});
			expect(await auth.api.getDbscState({ headers })).toEqual({
				status: "unbound",
			});
		});

		it("is bound with a fresh bound cookie and stale without it", async () => {
			const { auth, browser, signInAndRegister } = await setup();
			await signInAndRegister();
			const cookie = (names: string[]) =>
				new Headers({
					cookie: names
						.map((name) => `${name}=${browser.jar.get(name)}`)
						.join("; "),
				});
			expect(
				await auth.api.getDbscState({
					headers: cookie([SESSION_COOKIE, boundName(browser.jar)!]),
				}),
			).toEqual({ status: "bound" });
			expect(
				await auth.api.getDbscState({ headers: cookie([SESSION_COOKIE]) }),
			).toEqual({ status: "stale" });
		});
	});

	describe("startup", () => {
		it.each([
			[{ boundCookieMaxAge: 299 }],
			[{ boundCookieMaxAge: 600.5 }],
			[{ algorithms: [] }],
		])("rejects unusable options %o", async (options) => {
			await expect(
				getTestInstance({ plugins: [dbsc(options as DbscOptions)] }),
			).rejects.toThrow(/dbsc:/);
		});

		it("rejects cross-subdomain cookies", async () => {
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
});
