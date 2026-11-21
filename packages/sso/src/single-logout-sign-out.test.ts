import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { parseSetCookieHeader } from "better-auth/cookies";
import { bearer } from "better-auth/plugins";
import { describe, expect, it, vi } from "vitest";
import { sso } from ".";
import {
	SAML_SESSION_BY_ID_PREFIX,
	SAML_SESSION_KEY_PREFIX,
} from "./constants";

/**
 * Sign-out removes the session's single logout records whichever way the
 * session arrives. The instances are built directly to control the plugin
 * order, and the records are created directly so no identity provider is
 * needed.
 */
describe.each(["bearer listed first", "sso listed first"])(
	"single logout records on sign-out (%s)",
	(order) => {
		const createAuth = () => {
			const ssoPlugin = sso({
				saml: {
					enableSingleLogout: true,
				},
			});
			return betterAuth({
				baseURL: "http://localhost:3000",
				database: memoryAdapter({
					user: [],
					session: [],
					account: [],
					verification: [],
					ssoProvider: [],
				}),
				emailAndPassword: {
					enabled: true,
				},
				plugins:
					order === "bearer listed first"
						? [bearer(), ssoPlugin]
						: [ssoPlugin, bearer()],
			});
		};

		const signUpWithRecords = async (auth: ReturnType<typeof createAuth>) => {
			const signUp = await auth.api.signUpEmail({
				body: {
					email: "single-logout@example.com",
					password: "password123",
					name: "Single Logout",
				},
				returnHeaders: true,
			});
			const ctx = await auth.$context;
			const session = await ctx.internalAdapter.findSession(
				signUp.response.token ?? "",
			);
			const lookupKey = `${SAML_SESSION_BY_ID_PREFIX}${session?.session.id}`;
			const recordKey = `${SAML_SESSION_KEY_PREFIX}single-logout`;
			await ctx.internalAdapter.createVerificationValue({
				identifier: recordKey,
				value: JSON.stringify({
					sessionId: session?.session.id,
				}),
				expiresAt: new Date(Date.now() + 60_000),
			});
			await ctx.internalAdapter.createVerificationValue({
				identifier: lookupKey,
				value: recordKey,
				expiresAt: new Date(Date.now() + 60_000),
			});
			const sessionCookie = parseSetCookieHeader(
				signUp.headers.get("set-cookie") ?? "",
			).get("better-auth.session_token");
			return {
				token: signUp.headers.get("set-auth-token") ?? "",
				cookie: `better-auth.session_token=${sessionCookie?.value}`,
				hasSession: async () => {
					const current = await ctx.internalAdapter.findSession(
						signUp.response.token ?? "",
					);
					return Boolean(current);
				},
				hasRecords: async () => {
					const lookup =
						await ctx.internalAdapter.findVerificationValue(lookupKey);
					const record =
						await ctx.internalAdapter.findVerificationValue(recordKey);
					return Boolean(lookup || record);
				},
			};
		};

		const signOut = (
			auth: ReturnType<typeof createAuth>,
			headers: Record<string, string>,
		) =>
			auth.handler(
				new Request("http://localhost:3000/api/auth/sign-out", {
					method: "POST",
					headers: {
						...headers,
						"content-type": "application/json",
					},
					body: "{}",
				}),
			);

		it("should remove the records when signing out with the session cookie", async () => {
			const auth = createAuth();
			const { cookie, hasRecords } = await signUpWithRecords(auth);
			await signOut(auth, {
				cookie,
			});
			expect(await hasRecords()).toBe(false);
		});

		it("should remove the records when signing out with a bearer token", async () => {
			const auth = createAuth();
			const { token, hasRecords } = await signUpWithRecords(auth);
			await signOut(auth, {
				authorization: `Bearer ${token}`,
			});
			expect(await hasRecords()).toBe(false);
		});

		it("should remove the records when signing out through auth.api with a bearer token", async () => {
			const auth = createAuth();
			const { token, hasRecords } = await signUpWithRecords(auth);
			await auth.api.signOut({
				headers: new Headers({
					authorization: `Bearer ${token}`,
				}),
			});
			expect(await hasRecords()).toBe(false);
		});

		it("should still end a bearer session when its records cannot be read", async () => {
			const auth = createAuth();
			const { token, hasSession } = await signUpWithRecords(auth);
			const ctx = await auth.$context;
			vi.spyOn(ctx.internalAdapter, "findVerificationValue").mockRejectedValue(
				new Error("storage unavailable"),
			);
			const response = await signOut(auth, {
				authorization: `Bearer ${token}`,
			});
			expect(response.status).toBe(200);
			expect(await hasSession()).toBe(false);
		});
	},
);
