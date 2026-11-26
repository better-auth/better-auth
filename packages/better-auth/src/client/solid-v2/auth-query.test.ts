// @vitest-environment happy-dom

import { BetterFetchError } from "@better-fetch/fetch";
import { createRoot, flush, isPending, NotReadyError, resolve } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import type { AuthQueryState } from "../query";
import { createAuthQueryAtom } from "../query-atom";
import { createAuthQueryHook } from "./auth-query";

type Item = { id: string };
type Refetch = AuthQueryState<Item>["refetch"];

function createQuery(
	initial: Partial<AuthQueryState<Item>> = {},
	refetch: Refetch = vi.fn<Refetch>(async () => {}),
) {
	const store = createAuthQueryAtom<AuthQueryState<Item>>({
		data: null,
		error: null,
		isPending: true,
		isRefetching: false,
		refetch,
		...initial,
	});
	const { query, dispose } = createRoot((dispose) => ({
		query: createAuthQueryHook(store)(),
		dispose,
	}));
	return { store, query, dispose, refetch };
}

/** Lets a `from()` push reach its reader, then commits staged writes. */
async function settle() {
	await Promise.resolve();
	flush();
}

/**
 * Auth-query atoms (session, organization, passkeys, …) map onto Solid 2's
 * async model: pending until the first answer, errors without data reach
 * `<Errored>`, and a 401 means "signed out" rather than an error.
 *
 * @see https://docs.solidjs.com/concepts/async-reactivity
 */
describe("createAuthQueryHook", () => {
	it("is pending until the first answer", async () => {
		const { store, query, dispose } = createQuery();
		expect(() => query()).toThrow(NotReadyError);
		store.set({ ...store.get(), data: { id: "1" }, isPending: false });
		await expect(resolve(() => query())).resolves.toEqual({ id: "1" });
		dispose();
	});

	it("resolves to null on 401 instead of erroring", async () => {
		const { store, query, dispose } = createQuery();
		store.set({
			...store.get(),
			error: new BetterFetchError(401, "Unauthorized", null),
			isPending: false,
		});
		await expect(resolve(() => query())).resolves.toBeNull();
		dispose();
	});

	it("rejects on a first-load error with no data", async () => {
		const { store, query, dispose } = createQuery();
		expect(() => query()).toThrow(NotReadyError);
		store.set({
			...store.get(),
			error: new BetterFetchError(500, "Internal Server Error", {
				message: "boom",
			}),
			isPending: false,
		});
		await expect(resolve(() => query())).rejects.toMatchObject({
			status: 500,
		});
		dispose();
	});

	it("keeps stale data when a refetch fails", async () => {
		const { store, query, dispose } = createQuery({
			data: { id: "1" },
			isPending: false,
		});
		expect(query()).toEqual({ id: "1" });
		store.set({
			...store.get(),
			error: new BetterFetchError(500, "Internal Server Error", null),
		});
		await settle();
		expect(query()).toEqual({ id: "1" });
		dispose();
	});

	it("stays null when a background refetch fails while signed out", async () => {
		const { store, query, dispose } = createQuery({ isPending: false });
		expect(query()).toBeNull();
		store.set({
			...store.get(),
			error: new BetterFetchError(500, "Internal Server Error", null),
		});
		await settle();
		expect(query()).toBeNull();
		store.set({ ...store.get(), error: null, data: { id: "1" } });
		await settle();
		expect(query()).toEqual({ id: "1" });
		dispose();
	});

	it("stays null when refetch() fails while signed out", async () => {
		let store: ReturnType<typeof createQuery>["store"] | undefined;
		const failingRefetch = vi.fn<Refetch>(async () => {
			store?.set({
				...store.get(),
				error: new BetterFetchError(503, "Service Unavailable", null),
			});
		});
		const created = createQuery({ isPending: false }, failingRefetch);
		store = created.store;
		const { query, dispose } = created;
		expect(query()).toBeNull();
		await query.refetch();
		await settle();
		expect(query()).toBeNull();
		expect(isPending(() => query())).toBe(false);
		dispose();
	});

	it("resolves refetch() and clears pending when a refetch fails with data", async () => {
		let store: ReturnType<typeof createQuery>["store"] | undefined;
		const failingRefetch = vi.fn<Refetch>(async () => {
			store?.set({
				...store.get(),
				error: new BetterFetchError(500, "Internal Server Error", null),
			});
		});
		const created = createQuery(
			{ data: { id: "1" }, isPending: false },
			failingRefetch,
		);
		store = created.store;
		const { query, dispose } = created;
		expect(query()).toEqual({ id: "1" });
		await expect(query.refetch()).resolves.toBeUndefined();
		await settle();
		expect(query()).toEqual({ id: "1" });
		expect(isPending(() => query())).toBe(false);
		dispose();
	});

	it("moves from signed in to null without suspending", async () => {
		const { store, query, dispose } = createQuery({
			data: { id: "1" },
			isPending: false,
		});
		expect(query()).toEqual({ id: "1" });
		store.set({ ...store.get(), data: null });
		await settle();
		expect(query()).toBeNull();
		dispose();
	});

	it("reports pending while refetch runs", async () => {
		const { promise, resolve: finish } = Promise.withResolvers<void>();
		const { query, dispose } = createQuery(
			{ data: { id: "1" }, isPending: false },
			vi.fn<Refetch>(() => promise),
		);
		expect(query()).toEqual({ id: "1" });
		const running = query.refetch();
		flush();
		expect(isPending(() => query())).toBe(true);
		finish();
		await running;
		flush();
		expect(isPending(() => query())).toBe(false);
		dispose();
	});

	it("forwards query params to the atom's refetch", async () => {
		const refetch = vi.fn<Refetch>(async () => {});
		const { query, dispose } = createQuery(
			{ data: { id: "1" }, isPending: false },
			refetch,
		);
		await query.refetch({ query: { disableCookieCache: true } });
		expect(refetch).toHaveBeenCalledWith({
			query: { disableCookieCache: true },
		});
		dispose();
	});

	it("ignores the server value in the browser", async () => {
		const store = createAuthQueryAtom<AuthQueryState<Item>>({
			data: null,
			error: null,
			isPending: true,
			isRefetching: false,
			refetch: vi.fn<Refetch>(async () => {}),
		});
		const { query, dispose } = createRoot((dispose) => ({
			query: createAuthQueryHook(store)(() => ({ id: "server" })),
			dispose,
		}));
		expect(() => query()).toThrow(NotReadyError);
		store.set({ ...store.get(), data: { id: "client" }, isPending: false });
		await expect(resolve(() => query())).resolves.toEqual({ id: "client" });
		dispose();
	});

	it("re-subscribing in the error state triggers a refetch", () => {
		const refetch = vi.fn<Refetch>(async () => {});
		const { query, dispose } = createQuery(
			{
				error: new BetterFetchError(500, "Internal Server Error", null),
				isPending: false,
			},
			refetch,
		);
		expect(() => query()).toThrow(NotReadyError);
		expect(refetch).toHaveBeenCalledTimes(1);
		dispose();
	});
});
