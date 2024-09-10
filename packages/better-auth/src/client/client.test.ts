import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { createAuthClient as createSolidClient } from "./solid";
import { createAuthClient as createReactClient } from "./react";
import { createAuthClient as createVueClient } from "./vue";
import { createAuthClient as createSvelteClient } from "./svelte";
import { testClientPlugin, testClientPlugin2 } from "./test-plugin";
import type { Accessor } from "solid-js";
import type { Ref } from "vue";
import type { ReadableAtom } from "nanostores";
import type { Session } from "../adapters/schema";
import { BetterFetchError } from "@better-fetch/fetch";

describe("run time proxy", async () => {
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
		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(1);
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
		await vi.advanceTimersByTimeAsync(1);
		expect(res()).toMatchObject({
			data: null,
			error: null,
			isPending: false,
		});
	});
});

describe("type", () => {
	it("should infer session additional fields", () => {
		const client = createReactClient({
			plugins: [testClientPlugin()],
			baseURL: "http://localhost:3000",
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
					image?: string | undefined;
					testField4: string;
					testField?: string | undefined;
					testField2?: number | undefined;
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
		});
		expectTypeOf(client.useComputedAtom).toEqualTypeOf<() => number>();
	});
	it("should infer resolved hooks solid", () => {
		const client = createSolidClient({
			plugins: [testClientPlugin()],
			baseURL: "http://localhost:3000",
		});
		expectTypeOf(client.useComputedAtom).toEqualTypeOf<
			() => Accessor<number>
		>();
	});
	it("should infer resolved hooks vue", () => {
		const client = createVueClient({
			plugins: [testClientPlugin()],
			baseURL: "http://localhost:3000",
		});
		expectTypeOf(client.useComputedAtom).toEqualTypeOf<
			() => Readonly<Ref<number>>
		>();
	});
	it("should infer resolved hooks svelte", () => {
		const client = createSvelteClient({
			plugins: [testClientPlugin()],
			baseURL: "http://localhost:3000",
		});
		expectTypeOf(client.useComputedAtom).toEqualTypeOf<ReadableAtom<number>>();
	});

	it("should infer from multiple plugins", () => {
		const client = createSolidClient({
			plugins: [testClientPlugin(), testClientPlugin2()],
			baseURL: "http://localhost:3000",
		});
		const res = client.useAnotherAtom();
	});

	it("should infer actions", () => {
		const client = createSolidClient({
			plugins: [testClientPlugin(), testClientPlugin2()],
			baseURL: "http://localhost:3000",
		});
		expectTypeOf(client.setTestAtom).toEqualTypeOf<(value: boolean) => void>();
		expectTypeOf(client.test.signOut).toEqualTypeOf<() => Promise<void>>();
	});
});
