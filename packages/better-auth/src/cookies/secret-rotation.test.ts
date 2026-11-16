import { memoryAdapter } from "@better-auth/memory-adapter";
import { describe, expect, it } from "vitest";
import { betterAuth } from "../auth/full";
import { parseSetCookieHeader } from "./cookie-utils";

/**
 * @see https://github.com/better-auth/better-auth/issues/12636
 */
describe("secret rotation keeps signed session cookies valid", () => {
	const v1 = { version: 1, value: "a".repeat(32) };
	const v2 = { version: 2, value: "b".repeat(32) };

	function cookieHeaderFromResponse(res: Response) {
		return res.headers
			.getSetCookie()
			.map((c) => c.split(";")[0])
			.join("; ");
	}

	it("verifies session_token signed with a prior secret after rotation", async () => {
		const db: Record<string, any[]> = {
			user: [],
			session: [],
			account: [],
			verification: [],
		};
		const make = (secrets: Array<{ version: number; value: string }>) =>
			betterAuth({
				baseURL: "http://localhost:3000",
				database: memoryAdapter(db),
				emailAndPassword: { enabled: true },
				secrets,
			});

		const res = await make([v1]).api.signUpEmail({
			body: {
				email: "rotate@example.com",
				password: "password1234",
				name: "Rotate",
			},
			asResponse: true,
		});
		const headers = new Headers({
			cookie: cookieHeaderFromResponse(res),
		});

		expect(
			(await make([v1]).api.getSession({ headers }))?.user.email ?? null,
		).toBe("rotate@example.com");
		expect(
			(await make([v2, v1]).api.getSession({ headers }))?.user.email ?? null,
		).toBe("rotate@example.com");
		expect(db.session.length).toBe(1);
	});

	it("re-signs the session cookie with the current secret on read", async () => {
		const db: Record<string, any[]> = {
			user: [],
			session: [],
			account: [],
			verification: [],
		};
		const make = (secrets: Array<{ version: number; value: string }>) =>
			betterAuth({
				baseURL: "http://localhost:3000",
				database: memoryAdapter(db),
				emailAndPassword: { enabled: true },
				secrets,
			});

		const signUp = await make([v1]).api.signUpEmail({
			body: {
				email: "resign@example.com",
				password: "password1234",
				name: "Resign",
			},
			asResponse: true,
		});
		const oldCookies = cookieHeaderFromResponse(signUp);

		const rotated = await make([v2, v1]).api.getSession({
			headers: new Headers({ cookie: oldCookies }),
			asResponse: true,
		});
		expect(rotated.status).toBe(200);
		const setCookies = parseSetCookieHeader(
			rotated.headers.get("set-cookie") || "",
		);
		const resigned = setCookies.get("better-auth.session_token");
		expect(resigned?.value).toBeTruthy();

		const afterDrop = await make([v2]).api.getSession({
			headers: new Headers({
				cookie: `better-auth.session_token=${resigned!.value}`,
			}),
		});
		expect(afterDrop?.user.email).toBe("resign@example.com");

		const stillOld = await make([v2]).api.getSession({
			headers: new Headers({ cookie: oldCookies }),
		});
		expect(stillOld).toBeNull();
	});

	it("verifies compact cookie-cache signed with a prior secret", async () => {
		const db: Record<string, any[]> = {
			user: [],
			session: [],
			account: [],
			verification: [],
		};
		const make = (secrets: Array<{ version: number; value: string }>) =>
			betterAuth({
				baseURL: "http://localhost:3000",
				database: memoryAdapter(db),
				emailAndPassword: { enabled: true },
				secrets,
				session: {
					cookieCache: {
						enabled: true,
						strategy: "compact",
						maxAge: 60 * 5,
					},
				},
			});

		const res = await make([v1]).api.signUpEmail({
			body: {
				email: "cache-rotate@example.com",
				password: "password1234",
				name: "Cache",
			},
			asResponse: true,
		});
		const headers = new Headers({
			cookie: cookieHeaderFromResponse(res),
		});

		const session = await make([v2, v1]).api.getSession({ headers });
		expect(session?.user.email).toBe("cache-rotate@example.com");
	});

	it("verifies jwt cookie-cache signed with a prior secret", async () => {
		const db: Record<string, any[]> = {
			user: [],
			session: [],
			account: [],
			verification: [],
		};
		const make = (secrets: Array<{ version: number; value: string }>) =>
			betterAuth({
				baseURL: "http://localhost:3000",
				database: memoryAdapter(db),
				emailAndPassword: { enabled: true },
				secrets,
				session: {
					cookieCache: {
						enabled: true,
						strategy: "jwt",
						maxAge: 60 * 5,
					},
				},
			});

		const res = await make([v1]).api.signUpEmail({
			body: {
				email: "jwt-rotate@example.com",
				password: "password1234",
				name: "JWT",
			},
			asResponse: true,
		});
		const headers = new Headers({
			cookie: cookieHeaderFromResponse(res),
		});

		const session = await make([v2, v1]).api.getSession({ headers });
		expect(session?.user.email).toBe("jwt-rotate@example.com");
	});
});
