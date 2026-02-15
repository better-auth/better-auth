import { describe, expect, expectTypeOf, it } from "vitest";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils/test-instance";
import type { BetterAuthOptions } from "../../types";
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
});
