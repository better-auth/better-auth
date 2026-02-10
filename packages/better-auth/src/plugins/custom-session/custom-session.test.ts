import { describe, expect, expectTypeOf, it } from "vitest";
import { createAuthClient } from "../../client";
import { parseSetCookieHeader } from "../../cookies";
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

	it("should return set cookie headers", async () => {
		const { headers } = await signInWithTestUser();
		await client.getSession({
			fetchOptions: {
				headers,
				onResponse(context) {
					const header = context.response.headers.get("set-cookie");
					expect(header).toBeDefined();

					const cookies = parseSetCookieHeader(header!);
					expect(cookies.has("better-auth.session_token")).toBe(true);
					expect(cookies.has("better-auth.session_data")).toBe(true);
				},
			},
		});
	});

	/**
	 * Verifies that multiple Set-Cookie headers are sent as separate headers,
	 * not comma-joined into a single header (which would corrupt cookie attributes).
	 *
	 * @see https://github.com/better-auth/better-auth/issues/7878
	 */
	it("should send multiple Set-Cookie headers separately (not comma-joined)", async () => {
		const { headers } = await signInWithTestUser();
		await client.getSession({
			fetchOptions: {
				headers,
				onResponse(context) {
					// Use getSetCookie() to get individual Set-Cookie headers as an array
					// This is the correct way to read multiple Set-Cookie headers
					const setCookies = context.response.headers.getSetCookie();

					// Should have at least 2 cookies (session_token and session_data)
					expect(setCookies.length).toBeGreaterThanOrEqual(2);

					// Find the session_token and session_data cookies
					const sessionTokenCookie = setCookies.find((c) =>
						c.startsWith("better-auth.session_token="),
					);
					const sessionDataCookie = setCookies.find((c) =>
						c.startsWith("better-auth.session_data="),
					);

					expect(sessionTokenCookie).toBeDefined();
					expect(sessionDataCookie).toBeDefined();

					// Each cookie should have its own Max-Age attribute
					expect(sessionTokenCookie).toMatch(/Max-Age=\d+/);
					expect(sessionDataCookie).toMatch(/Max-Age=\d+/);

					// Critical: each cookie string should only contain ONE cookie
					// If they were comma-joined incorrectly, one cookie string would
					// contain both cookie names
					expect(sessionTokenCookie).not.toContain("better-auth.session_data");
					expect(sessionDataCookie).not.toContain("better-auth.session_token");

					// Verify each cookie has proper structure (name=value; attributes)
					// and hasn't been corrupted by comma-joining
					expect(sessionTokenCookie!.split(";")[0]).toMatch(
						/^better-auth\.session_token=[^,]+$/,
					);
					expect(sessionDataCookie!.split(";")[0]).toMatch(
						/^better-auth\.session_data=[^,]+$/,
					);
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
