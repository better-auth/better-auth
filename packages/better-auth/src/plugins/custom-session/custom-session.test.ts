import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { createAuthClient } from "../../client";
import {
	deleteSessionCookie,
	expireCookie,
	parseSetCookieHeader,
} from "../../cookies";
import { getTestInstance } from "../../test-utils/test-instance";
import type { BetterAuthOptions } from "../../types";
import { inferAdditionalFields } from "../additional-fields/client";
import { admin } from "../admin";
import { adminClient } from "../admin/client";
import { multiSession } from "../multi-session";
import { multiSessionClient } from "../multi-session/client";
import { customSession } from ".";
import { customSessionClient } from "./client";

describe("Custom Session Plugin Tests", async () => {
	const options = {
		plugins: [admin(), multiSession()],
	} satisfies BetterAuthOptions;
	const { auth, signInWithTestUser, customFetchImpl, cookieSetter } =
		await getTestInstance({
			session: {
				maxAge: 10,
				updateAge: 0,
				cookieCache: {
					enabled: true,
					maxAge: 10,
				},
			},
			plugins: [
				...options.plugins,
				customSession(
					async ({ user, session }) => {
						const newData = {
							message: "Hello, World!",
						};
						return {
							user: {
								firstName: user.name.split(" ")[0],
								lastName: user.name.split(" ")[1],
							},
							newData,
							session,
						};
					},
					options,
					{ shouldMutateListDeviceSessionsEndpoint: true },
				),
			],
		});

	const client = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [
			customSessionClient<typeof auth>(),
			adminClient(),
			multiSessionClient(),
		],
		fetchOptions: { customFetchImpl },
	});

	it("should return the session", async () => {
		const { headers } = await signInWithTestUser();
		const session = await auth.api.getSession({ headers });
		const s = await client.getSession({ fetchOptions: { headers } });
		expect(s.data?.newData).toEqual({ message: "Hello, World!" });
		expect(session?.newData).toEqual({ message: "Hello, World!" });
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10567
	 */
	it("preserves no-store when a custom session callback sets cache headers", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				customSession(async (session, ctx) => {
					ctx.setHeader("cache-control", "public, max-age=3600");
					return session;
				}),
			],
		});
		const { headers } = await signInWithTestUser();
		const response = await auth.api.getSession({ headers, asResponse: true });
		expect(response.headers.get("cache-control")).toBe("no-store");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10566
	 */
	it("propagates session lookup failures to server and HTTP clients", async () => {
		const { auth, client, signInWithTestUser } = await getTestInstance({
			plugins: [customSession(async (session) => session)],
		});
		const { headers } = await signInWithTestUser();
		const context = await auth.$context;
		const lookup = vi
			.spyOn(context.internalAdapter, "findSession")
			.mockRejectedValue(new Error("database unavailable"));
		try {
			await expect(auth.api.getSession({ headers })).rejects.toMatchObject({
				status: "INTERNAL_SERVER_ERROR",
			});
			const result = await client.getSession({ fetchOptions: { headers } });
			expect(result.error?.status).toBe(500);
		} finally {
			lookup.mockRestore();
		}
	});

	it("should return set cookie headers as separate entries", async () => {
		const { headers } = await signInWithTestUser();
		await client.getSession({
			fetchOptions: {
				headers,
				onResponse(context) {
					const setCookies = context.response.headers.getSetCookie();
					// Each Set-Cookie must be a separate header (not comma-joined)
					// to ensure browsers correctly parse individual cookie attributes
					expect(setCookies.length).toBeGreaterThanOrEqual(2);
					const joined = setCookies.join("; ");
					expect(joined).toContain("better-auth.session_token");
					expect(joined).toContain("better-auth.session_data");
				},
			},
		});
	});

	it("should not double-encode session cookie during get-session refresh", async () => {
		const { headers } = await signInWithTestUser();
		const signedInCookie = headers.get("cookie");
		const signedInSessionToken = signedInCookie?.match(
			/better-auth\.session_token=([^;]+)/,
		)?.[1];
		expect(signedInSessionToken).toBeDefined();

		let refreshedSessionToken: string | undefined;
		await client.getSession({
			fetchOptions: {
				headers,
				onResponse(context) {
					const setCookies = context.response.headers.getSetCookie();
					for (const cookieStr of setCookies) {
						const parsed = parseSetCookieHeader(cookieStr);
						const token = parsed.get("better-auth.session_token")?.value;
						if (token) {
							refreshedSessionToken = token;
							break;
						}
					}
				},
			},
		});

		expect(refreshedSessionToken).toBeDefined();
		expect(refreshedSessionToken).toBe(signedInSessionToken);
		expect(refreshedSessionToken).not.toContain("%25");
	});

	it("should return the custom session for multi-session", async () => {
		const headers = new Headers();
		const testUser = {
			email: "second-email@test.com",
			password: "password",
			name: "Name",
		};

		await client.signUp.email(
			{
				name: testUser.name,
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);
		const sessions = await auth.api.listDeviceSessions({
			headers,
		});
		const session = sessions[0]!;
		//@ts-expect-error
		expect(session.newData).toEqual({ message: "Hello, World!" });
	});

	it("should preserve individual cookie Max-Age when cookieCache is enabled", async () => {
		const sessionExpiresIn = 86400;
		const cacheMaxAge = 300;
		const {
			auth: authWithCache,
			signInWithTestUser: signInWithCache,
			customFetchImpl: cacheFetchImpl,
		} = await getTestInstance({
			session: {
				expiresIn: sessionExpiresIn,
				updateAge: 0,
				cookieCache: {
					enabled: true,
					maxAge: cacheMaxAge,
				},
			},
			plugins: [
				customSession(async ({ user, session }) => {
					return { user, session };
				}),
			],
		});

		const cacheClient = createAuthClient({
			baseURL: "http://localhost:3000",
			plugins: [customSessionClient<typeof authWithCache>()],
			fetchOptions: { customFetchImpl: cacheFetchImpl },
		});

		const { headers } = await signInWithCache();
		await cacheClient.getSession({
			fetchOptions: {
				headers,
				onResponse(context) {
					const setCookies = context.response.headers.getSetCookie();
					expect(setCookies.length).toBeGreaterThanOrEqual(2);

					// Each cookie must be its own Set-Cookie header entry.
					// If they were comma-joined, the browser would merge attributes
					// and the session_token could inherit the short Max-Age from
					// session_data, causing premature session expiry.
					const tokenCookie = setCookies.find((c) =>
						c.includes("better-auth.session_token"),
					);
					const dataCookie = setCookies.find((c) =>
						c.includes("better-auth.session_data"),
					);
					expect(tokenCookie).toBeDefined();
					expect(dataCookie).toBeDefined();

					// Verify each cookie has its own Max-Age attribute
					const tokenMaxAge = tokenCookie!.match(/Max-Age=(\d+)/i);
					const dataMaxAge = dataCookie!.match(/Max-Age=(\d+)/i);
					expect(tokenMaxAge).toBeTruthy();
					expect(dataMaxAge).toBeTruthy();

					const tokenMaxAgeValue = Number(tokenMaxAge![1]);
					const dataMaxAgeValue = Number(dataMaxAge![1]);

					// session_token must have the session expiresIn (within a small
					// tolerance for elapsed time), not the shorter cookieCache maxAge
					// (which would happen if headers were comma-joined)
					expect(tokenMaxAgeValue).toBeGreaterThan(sessionExpiresIn - 10);
					expect(tokenMaxAgeValue).toBeLessThanOrEqual(sessionExpiresIn);
					expect(dataMaxAgeValue).toBe(cacheMaxAge);

					// The critical invariant: token and data cookies must have
					// different Max-Age values when configured differently
					expect(tokenMaxAgeValue).not.toBe(dataMaxAgeValue);
				},
			},
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9195
	 */
	it("should accept disableRefresh as a query string without validation error", async () => {
		const { headers } = await signInWithTestUser();
		const session = await client.getSession({
			query: { disableRefresh: true },
			fetchOptions: { headers },
		});
		expect(session.data).not.toBeNull();
		expect(session.error).toBeNull();
	});

	it("should not comma-join Set-Cookie headers", async () => {
		const { headers } = await signInWithTestUser();
		await client.getSession({
			fetchOptions: {
				headers,
				onResponse(context) {
					const setCookies = context.response.headers.getSetCookie();
					// No single entry should contain multiple cookie assignments.
					// A comma-joined header would look like:
					// "session_token=xxx; ..., session_data=yyy; ..."
					for (const cookie of setCookies) {
						const cookieNames = cookie
							.split(";")
							.map((p) => p.trim().split("=")[0]!.toLowerCase());
						// Only the first segment is the cookie name=value; the rest are
						// attributes (max-age, path, httponly, samesite, etc.)
						// None of those attributes should be another "better-auth." cookie
						const betterAuthEntries = cookieNames.filter((n) =>
							n.startsWith("better-auth."),
						);
						expect(betterAuthEntries).toHaveLength(1);
					}
				},
			},
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9231
	 */
	it("should preserve partitioned cookie attributes during get-session refresh", async () => {
		const {
			auth: partitionedAuth,
			signInWithTestUser: signInWithPartitionedCookies,
			customFetchImpl: partitionedFetchImpl,
		} = await getTestInstance({
			advanced: {
				defaultCookieAttributes: {
					partitioned: true,
					sameSite: "none",
					secure: true,
					httpOnly: true,
				},
			},
			session: {
				updateAge: 0,
			},
			plugins: [
				customSession(async ({ user, session }) => {
					return { user, session };
				}),
			],
		});

		const partitionedClient = createAuthClient({
			baseURL: "http://localhost:3000",
			plugins: [customSessionClient<typeof partitionedAuth>()],
			fetchOptions: { customFetchImpl: partitionedFetchImpl },
		});

		const { headers } = await signInWithPartitionedCookies();

		await partitionedClient.getSession({
			fetchOptions: {
				headers,
				onResponse(context) {
					const refreshedCookies = context.response.headers.getSetCookie();
					expect(refreshedCookies.length).toBeGreaterThan(0);

					const parsedCookies = refreshedCookies.flatMap((cookieString) =>
						Array.from(parseSetCookieHeader(cookieString).entries()),
					);
					const betterAuthCookies = parsedCookies.filter(([name]) =>
						name.startsWith("better-auth."),
					);

					expect(betterAuthCookies.length).toBeGreaterThan(0);
					for (const [, attributes] of betterAuthCookies) {
						expect(attributes.partitioned).toBe(true);
					}
				},
			},
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10567
	 */
	it("should expire the session cookies when the session is no longer valid", async () => {
		const staleOptions = {
			plugins: [
				customSession(async ({ user, session }) => {
					return { user, session };
				}),
			],
		} satisfies BetterAuthOptions;

		const {
			auth: staleAuth,
			client: staleClient,
			signInWithTestUser: signInWithStaleUser,
			db,
		} = await getTestInstance(staleOptions, {
			clientOptions: {
				plugins: [customSessionClient<{ options: typeof staleOptions }>()],
			},
		});

		const { headers } = await signInWithStaleUser();
		const activeSession = await staleAuth.api.getSession({ headers });
		const sessionToken = activeSession?.session.token;
		if (!sessionToken) throw new Error("expected an active session");

		// Revoke the backing session row while the client keeps its cookies.
		await db.delete({
			model: "session",
			where: [{ field: "token", value: sessionToken }],
		});

		let setCookies: string[] = [];
		const session = await staleClient.getSession({
			fetchOptions: {
				headers,
				onResponse(context) {
					setCookies = context.response.headers.getSetCookie();
				},
			},
		});

		expect(session.data).toBeNull();

		const parsedCookies = new Map(
			setCookies.flatMap((cookieString) =>
				Array.from(parseSetCookieHeader(cookieString).entries()),
			),
		);
		const expiredSessionToken = parsedCookies.get("better-auth.session_token");
		expect(expiredSessionToken).toBeDefined();
		expect(expiredSessionToken?.value).toBe("");
		expect(expiredSessionToken?.["max-age"]).toBe(0);
	});

	it.skipIf(globalThis.gc == null)(
		"should not create memory leaks with multiple plugin instances",
		async () => {
			const initialMemory = process.memoryUsage();

			const pluginInstances = [];
			const sessionCount = 100;

			for (let i = 0; i < sessionCount; i++) {
				const plugin = customSession(async ({ user, session }) => {
					return {
						user: {
							...user,
							testField: `test-${i}`,
						},
						session,
						iteration: i,
					};
				});
				pluginInstances.push(plugin);
			}
			// Force garbage collection (only works if Node.js is started with --expose-gc)
			// @ts-expect-error
			globalThis.gc();

			const afterPluginCreation = process.memoryUsage();

			const memoryIncrease =
				afterPluginCreation.heapUsed - initialMemory.heapUsed;
			const memoryIncreasePerPlugin = memoryIncrease / sessionCount;
			// Each plugin instance should not use more than <5KB of memory
			// (this is a reasonable threshold that indicates no major memory leak)
			expect(memoryIncreasePerPlugin).toBeLessThan(5 * 1024);
			// Verify that plugins are still functional
			expect(pluginInstances).toHaveLength(sessionCount);
			expect(pluginInstances[0]!.id).toBe("custom-session");
			expect(pluginInstances[sessionCount - 1]!.id).toBe("custom-session");
		},
	);

	it("should infer the session type", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				customSession(async ({ user, session }) => {
					return {
						custom: {
							field: "field",
						},
					};
				}),
			],
		});
		type Session = typeof auth.$Infer.Session;

		expectTypeOf<Session>().toEqualTypeOf<{
			custom: {
				field: string;
			};
		}>();
	});

	it("should not add user/session to client getSession type when custom session omits them", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				customSession(async () => {
					return {
						custom: {
							field: "field",
						},
					};
				}),
			],
		});

		const client = createAuthClient({
			plugins: [customSessionClient<typeof auth>()],
		});

		type SessionData = typeof client.$Infer.Session;

		// When custom session omits user/session, the client type must not claim they exist
		expectTypeOf<SessionData>().toEqualTypeOf<{
			custom: {
				field: string;
			};
		}>();

		// Verify user and session are not in the type
		expectTypeOf<keyof SessionData>().toEqualTypeOf<"custom">();
	});

	it("should infer both customSessionClient and inferAdditionalFields when combined", async () => {
		const { auth } = await getTestInstance({
			user: {
				additionalFields: {
					role: {
						type: "string",
						required: false,
					},
				},
			},
			plugins: [
				customSession(async ({ user, session }) => {
					return {
						user: {
							firstName: user.name.split(" ")[0],
							lastName: user.name.split(" ")[1],
						},
						session,
						customData: { message: "hello" },
					};
				}),
			],
		});

		const client = createAuthClient({
			plugins: [
				customSessionClient<typeof auth>(),
				inferAdditionalFields<typeof auth>(),
			],
		});

		type SessionData = typeof client.$Infer.Session;
		type User = SessionData["user"];

		expectTypeOf<User>().toMatchObjectType<{
			id: string;
			firstName: string | undefined;
			lastName: string | undefined;
			role?: string | undefined | null;
		}>();

		type CustomData = SessionData["customData"];
		expectTypeOf<CustomData>().toMatchObjectType<{
			message: string;
		}>();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/12988
	 */
	it("should allow returning null from customSession while preserving $Infer.Session and cookie expiry", async () => {
		let shouldInvalidate = false;
		const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance(
			{
				session: {
					expiresIn: 100,
					updateAge: 0,
					cookieCache: {
						enabled: true,
						maxAge: 10,
					},
				},
				plugins: [
					customSession(async ({ user, session }, ctx) => {
						if (shouldInvalidate) {
							expireCookie(ctx, ctx.context.authCookies.sessionData);
							deleteSessionCookie(ctx);
							return null;
						}
						return {
							user,
							session,
							customFlag: true,
						};
					}),
				],
			},
		);

		type ServerInferredSession = typeof auth.$Infer.Session;
		expectTypeOf<ServerInferredSession>().not.toBeNullable();
		expectTypeOf<
			ServerInferredSession["customFlag"]
		>().toEqualTypeOf<boolean>();

		type ApiSessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;
		expectTypeOf<null>().toExtend<ApiSessionResult>();

		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			plugins: [customSessionClient<typeof auth>()],
			fetchOptions: { customFetchImpl },
		});

		type ClientInferredSession = typeof client.$Infer.Session;
		expectTypeOf<ClientInferredSession>().not.toBeNullable();
		expectTypeOf<
			ClientInferredSession["customFlag"]
		>().toEqualTypeOf<boolean>();

		const { headers } = await signInWithTestUser();

		const validSession = await auth.api.getSession({ headers });
		expect(validSession?.customFlag).toBe(true);

		shouldInvalidate = true;
		const invalidatedApi = await auth.api.getSession({ headers });
		expect(invalidatedApi).toBeNull();

		let expiredSetCookies: string[] = [];
		const invalidatedHttp = await auth.api.getSession({
			headers,
			asResponse: true,
		});
		expect(invalidatedHttp.status).toBe(200);
		expect(invalidatedHttp.headers.get("cache-control")).toBe("no-store");
		expect(await invalidatedHttp.json()).toBeNull();
		expiredSetCookies = invalidatedHttp.headers.getSetCookie();

		const cookieJar = new Map<string, string>();
		for (const rawCookie of (headers.get("cookie") ?? "").split(";")) {
			const trimmed = rawCookie.trim();
			if (!trimmed) continue;
			const eqIdx = trimmed.indexOf("=");
			if (eqIdx > 0) {
				cookieJar.set(trimmed.slice(0, eqIdx), trimmed.slice(eqIdx + 1));
			}
		}
		for (const setCookieStr of expiredSetCookies) {
			for (const [name, attrs] of parseSetCookieHeader(
				setCookieStr,
			).entries()) {
				if (attrs["max-age"] === 0 || attrs.value === "") {
					cookieJar.delete(name);
				} else {
					cookieJar.set(name, attrs.value);
				}
			}
		}

		expect(
			expiredSetCookies.some((c) => c.includes("better-auth.session_token=;")),
		).toBe(true);
		expect(cookieJar.has("better-auth.session_token")).toBe(false);
		expect(cookieJar.has("better-auth.session_data")).toBe(false);

		shouldInvalidate = false;
		const nextHeaders = new Headers();
		if (cookieJar.size > 0) {
			nextHeaders.set(
				"cookie",
				Array.from(cookieJar.entries())
					.map(([k, v]) => `${k}=${v}`)
					.join("; "),
			);
		}
		const followUp = await client.getSession({
			fetchOptions: { headers: nextHeaders },
		});
		expect(followUp.data).toBeNull();
		expect(followUp.error).toBeNull();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/12988
	 */
	it("should filter null results from mutated list-device-sessions response", async () => {
		const multiOptions = {
			plugins: [multiSession()],
		} satisfies BetterAuthOptions;

		let skipToken: string | undefined;
		const { auth, customFetchImpl, cookieSetter } = await getTestInstance({
			plugins: [
				...multiOptions.plugins,
				customSession(
					async ({ user, session }) => {
						if (session.token === skipToken) {
							return null;
						}
						return {
							user,
							session,
							kept: true,
						};
					},
					multiOptions,
					{ shouldMutateListDeviceSessionsEndpoint: true },
				),
			],
		});

		const localClient = createAuthClient({
			baseURL: "http://localhost:3000",
			plugins: [customSessionClient<typeof auth>(), multiSessionClient()],
			fetchOptions: { customFetchImpl },
		});

		const headers = new Headers();
		await localClient.signUp.email(
			{
				name: "First User",
				email: "multi-filter-first@test.com",
				password: "password123",
			},
			{ onSuccess: cookieSetter(headers) },
		);
		await localClient.signUp.email(
			{
				name: "Second User",
				email: "multi-filter-second@test.com",
				password: "password123",
			},
			{ onSuccess: cookieSetter(headers) },
		);

		const beforeFilter = await auth.api.listDeviceSessions({ headers });
		expect(beforeFilter).toHaveLength(2);

		const active = await auth.api.getSession({ headers });
		skipToken = active?.session.token;
		expect(skipToken).toBeDefined();

		const sessions = await auth.api.listDeviceSessions({ headers });
		expect(sessions).toHaveLength(1);
		expect(sessions[0]).toMatchObject({
			user: { email: "multi-filter-first@test.com" },
			kept: true,
		});
	});
});
