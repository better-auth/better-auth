// @vitest-environment happy-dom

import { isProxy } from "node:util/types";
import type { BetterFetchError } from "@better-fetch/fetch";
import type { ReadableAtom } from "nanostores";
import type { Accessor } from "solid-js";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { Ref } from "vue";
import type { Session, SessionQueryParams } from "../types";
import {
	adminClient,
	deviceAuthorizationClient,
	emailOTPClient,
	genericOAuthClient,
	multiSessionClient,
	oidcClient,
	organizationClient,
	twoFactorClient,
} from "./plugins";
import { createAuthClient as createReactClient } from "./react";
import { createAuthClient as createSolidClient } from "./solid";
import { createAuthClient as createSvelteClient } from "./svelte";
import { testClientPlugin, testClientPlugin2 } from "./test-plugin";
import { createAuthClient as createVanillaClient } from "./vanilla";
import { createAuthClient as createVueClient } from "./vue";

describe("run time proxy", async () => {
	it("atom in proxy should not be proxy", async () => {
		const client = createVanillaClient();
		const atom = client.$store.atoms.session;
		expect(isProxy(atom)).toBe(false);
	});

	it("proxy api should be called", async () => {
		let apiCalled = false;
		const client = createSolidClient({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					apiCalled = true;
					return new Response();
				},
				baseURL: "http://localhost:3000",
			},
		});
		await client.test();
		expect(apiCalled).toBe(true);
	});

	it("state listener should be called on matched path", async () => {
		const client = createSolidClient({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response();
				},
				baseURL: "http://localhost:3000",
			},
		});
		const res = client.useComputedAtom();
		expect(res()).toBe(0);
		await client.test();
		vi.useFakeTimers();
		setTimeout(() => {
			expect(res()).toBe(1);
		}, 100);
	});

	it("should call useSession", async () => {
		vi.useFakeTimers();
		let returnNull = false;
		const client = createSolidClient({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async () => {
					if (returnNull) {
						return new Response(JSON.stringify(null));
					}
					return new Response(
						JSON.stringify({
							user: {
								id: 1,
								email: "test@email.com",
							},
						}),
					);
				},
				baseURL: "http://localhost:3000",
			},
		});
		const res = client.useSession();
		await vi.runAllTimersAsync();
		expect(res()).toMatchObject({
			data: { user: { id: 1, email: "test@email.com" } },
			error: null,
			isPending: false,
		});
		/**
		 * recall
		 */
		returnNull = true;
		await client.test2.signOut();
		await vi.runAllTimersAsync();
		expect(res()).toMatchObject({
			data: null,
			error: null,
			isPending: false,
		});
		vi.useRealTimers();
	});

	it("should allow second argument fetch options", async () => {
		let called = false;
		const client = createSolidClient({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response();
				},
				baseURL: "http://localhost:3000",
			},
		});
		await client.test(
			{},
			{
				onSuccess(context) {
					called = true;
				},
			},
		);
		expect(called).toBe(true);
	});

	it("should not expose a 'then', 'catch', 'finally' property on the proxy", async () => {
		const client = createSolidClient({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async () => new Response(),
				baseURL: "http://localhost:3000",
			},
		});
		const proxy = (client as any).test;
		expect(proxy.then).toBeUndefined();
		expect(proxy.catch).toBeUndefined();
		expect(proxy.finally).toBeUndefined();
	});
});

describe("type", () => {
	it("should not infer non-action endpoints", () => {
		const client = createReactClient({
			plugins: [testClientPlugin()],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response();
				},
			},
		});
		expectTypeOf<typeof client>().not.toHaveProperty("testNonAction");
	});
	it("should infer session additional fields", () => {
		const client = createReactClient({
			plugins: [testClientPlugin()],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response();
				},
			},
		});
		type ReturnedSession = ReturnType<typeof client.useSession>;
		expectTypeOf<ReturnedSession>().toMatchTypeOf<{
			data: {
				user: {
					id: string;
					email: string;
					emailVerified: boolean;
					name: string;
					createdAt: Date;
					updatedAt: Date;
					image?: string | undefined | null;
					testField4: string;
					testField?: string | undefined | null;
					testField2?: number | undefined | null;
				};
				session: Session;
			} | null;
			error: BetterFetchError | null;
			isPending: boolean;
		}>();
	});
	it("should infer resolved hooks react", () => {
		const client = createReactClient({
			plugins: [testClientPlugin()],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response();
				},
			},
		});
		expectTypeOf(client.useComputedAtom).toEqualTypeOf<() => number>();
	});
	it("should infer resolved hooks solid", () => {
		const client = createSolidClient({
			plugins: [testClientPlugin()],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response();
				},
			},
		});
		expectTypeOf(client.useComputedAtom).toEqualTypeOf<
			() => Accessor<number>
		>();
	});
	it("should infer resolved hooks vue", () => {
		const client = createVueClient({
			plugins: [testClientPlugin()],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response();
				},
			},
		});
		expectTypeOf(client.useComputedAtom).toEqualTypeOf<
			() => Readonly<Ref<number>>
		>();
	});
	it("should infer resolved hooks svelte", () => {
		const client = createSvelteClient({
			plugins: [testClientPlugin()],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response();
				},
			},
		});
		expectTypeOf(client.useComputedAtom).toEqualTypeOf<
			() => ReadableAtom<number>
		>();
	});

	it("should infer actions", () => {
		const client = createSolidClient({
			plugins: [testClientPlugin(), testClientPlugin2()],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response();
				},
			},
		});
		expectTypeOf(client.setTestAtom).toEqualTypeOf<(value: boolean) => void>();
		expectTypeOf(client.test.signOut).toEqualTypeOf<() => Promise<void>>();
	});

	it("should infer session", () => {
		const client = createSolidClient({
			plugins: [testClientPlugin(), testClientPlugin2(), twoFactorClient()],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response();
				},
			},
		});
		const $infer = client.$Infer;
		expectTypeOf<typeof $infer.Session>().toEqualTypeOf<{
			session: {
				id: string;
				userId: string;
				expiresAt: Date;
				token: string;
				ipAddress?: string | undefined | null;
				userAgent?: string | undefined | null;
				createdAt: Date;
				updatedAt: Date;
			};
			user: {
				id: string;
				email: string;
				emailVerified: boolean;
				name: string;
				createdAt: Date;
				updatedAt: Date;
				image?: string | undefined | null;
				testField4: string;
				testField?: string | undefined | null;
				testField2?: number | undefined | null;
				twoFactorEnabled: boolean | undefined | null;
			};
		}>();
	});

	it("should infer session react", () => {
		const client = createReactClient({
			plugins: [organizationClient(), twoFactorClient(), emailOTPClient()],
		});
		const $infer = client.$Infer.Session;
		expectTypeOf<typeof $infer.user>().toEqualTypeOf<{
			name: string;
			id: string;
			email: string;
			emailVerified: boolean;
			createdAt: Date;
			updatedAt: Date;
			image?: string | undefined | null;
			twoFactorEnabled: boolean | undefined | null;
		}>();
	});

	it("should infer `throw:true` in fetch options", async () => {
		const client = createReactClient({
			plugins: [testClientPlugin()],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				throw: true,
				customFetchImpl: async (url, init) => {
					return new Response();
				},
			},
		});
		const data = client.getSession();
		expectTypeOf(data).toMatchTypeOf<
			Promise<{
				user: {
					id: string;
					email: string;
					emailVerified: boolean;
					name: string;
					createdAt: Date;
					updatedAt: Date;
					image?: string | undefined | null;
					testField4: string;
					testField?: string | undefined | null;
					testField2?: number | undefined | null;
				};
				session: {
					id: string;
					userId: string;
					expiresAt: Date;
					ipAddress?: string | undefined | null;
					userAgent?: string | undefined | null;
				};
			} | null>
		>();
	});

	it("should infer `error` schema correctly", async () => {
		const client = createSolidClient({
			plugins: [testClientPlugin()],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response();
				},
			},
		});
		const { error } = await client.test();
		expectTypeOf(error!).toMatchObjectType<{
			code: number;
			message: string;
			test: boolean;
		}>();
	});

	it("should support refetch with query parameters", () => {
		const client = createReactClient({
			plugins: [testClientPlugin()],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response();
				},
			},
		});

		type UseSessionReturn = ReturnType<typeof client.useSession>;
		expectTypeOf<UseSessionReturn>().toMatchTypeOf<{
			data: {
				user: {
					id: string;
					email: string;
					emailVerified: boolean;
					name: string;
					createdAt: Date;
					updatedAt: Date;
					image?: string | undefined | null;
					testField4: string;
					testField?: string | undefined | null;
					testField2?: number | undefined | null;
				};
				session: Session;
			} | null;
			isPending: boolean;
			error: BetterFetchError | null;
			refetch: (
				queryParams?: { query?: SessionQueryParams } | undefined,
			) => void;
		}>();
	});

	it("should infer $ERROR_CODES with multiple plugins", () => {
		const client = createReactClient({
			plugins: [
				organizationClient(),
				twoFactorClient(),
				emailOTPClient(),
				adminClient(),
				multiSessionClient(),
				oidcClient(),
				genericOAuthClient(),
				deviceAuthorizationClient(),
				testClientPlugin(),
				testClientPlugin2(),
			],
		});

		// Should have organization error codes
		expectTypeOf(
			client.$ERROR_CODES.ORGANIZATION_NOT_FOUND,
		).toEqualTypeOf<"Organization not found">();

		// Should have two-factor error codes
		expectTypeOf(
			client.$ERROR_CODES.OTP_HAS_EXPIRED,
		).toEqualTypeOf<"OTP has expired">();

		// Should have email-otp error codes
		expectTypeOf(
			client.$ERROR_CODES.INVALID_EMAIL,
		).toEqualTypeOf<"Invalid email">();

		// Should have admin error codes
		expectTypeOf(
			client.$ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS,
		).toEqualTypeOf<"You are not allowed to revoke users sessions">();

		// Should have multi-session error codes
		expectTypeOf(
			client.$ERROR_CODES.INVALID_SESSION_TOKEN,
		).toEqualTypeOf<"Invalid session token">();

		// Should have generic-oauth error codes
		expectTypeOf(
			client.$ERROR_CODES.PROVIDER_NOT_FOUND,
		).toEqualTypeOf<"Provider not found">();

		// Should have device-authorization error codes
		expectTypeOf(
			client.$ERROR_CODES.INVALID_DEVICE_CODE,
		).toEqualTypeOf<"Invalid device code">();

		// Should have base error codes
		expectTypeOf(
			client.$ERROR_CODES.USER_NOT_FOUND,
		).toEqualTypeOf<"User not found">();
	});
});
