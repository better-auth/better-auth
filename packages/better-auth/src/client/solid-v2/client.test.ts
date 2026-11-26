// @vitest-environment happy-dom

import { isProxy } from "node:util/types";
import type { Accessor } from "solid-js";
import { createRoot, resolve } from "solid-js";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
	vi,
} from "vitest";
import type { Session } from "../../types";
import { testClientPlugin } from "../test-plugin";
import type { AuthQueryAccessor } from "./index";
import { createAuthClient } from "./index";

const sessionResponse = {
	user: { id: "1", email: "test@email.com" },
	session: { id: "session-1" },
};

function createClient() {
	const requests: string[] = [];
	const client = createAuthClient({
		plugins: [testClientPlugin()],
		baseURL: "http://localhost:3000",
		fetchOptions: {
			customFetchImpl: async (url) => {
				requests.push(url.toString());
				return new Response(JSON.stringify(sessionResponse));
			},
		},
	});
	const sessionRequests = () =>
		requests.filter((url) => url.includes("/get-session"));
	return { client, requests, sessionRequests };
}

describe("solid-v2 createAuthClient", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		for (const key of [
			"better-auth:broadcast-channel",
			"better-auth:focus-manager",
			"better-auth:online-manager",
		]) {
			Reflect.deleteProperty(globalThis, Symbol.for(key));
		}
	});

	describe("types", () => {
		it("types useSession as an async accessor of the inferred session", () => {
			const { client } = createClient();
			type SessionValue = ReturnType<ReturnType<typeof client.useSession>>;
			expectTypeOf<SessionValue>().toEqualTypeOf<
				typeof client.$Infer.Session | null
			>();
			expectTypeOf<NonNullable<SessionValue>>().toMatchTypeOf<{
				user: { id: string; email: string; testField4: string };
				session: Session;
			}>();
			expectTypeOf(client.useSession()).toEqualTypeOf<
				AuthQueryAccessor<typeof client.$Infer.Session>
			>();
		});

		it("types plain plugin atoms as accessors and query atoms as async accessors", () => {
			const { client } = createClient();
			expectTypeOf(client.useComputedAtom).returns.toEqualTypeOf<
				Accessor<number>
			>();
			expectTypeOf(client.useQueryAtom()).toHaveProperty("refetch");
		});

		it("does not expose $-prefixed signal atoms as hooks", () => {
			const { client } = createClient();
			expectTypeOf(client).not.toHaveProperty("use$test");
			expectTypeOf(client).not.toHaveProperty("use$signal");
		});
	});

	it("does not create hooks for $-prefixed signal atoms", () => {
		const { client } = createClient();
		// A missing route falls through to the client's path proxy.
		expect(isProxy(Reflect.get(client, "use$signal"))).toBe(true);
		expect(isProxy(Reflect.get(client, "use$test"))).toBe(true);
		expect(isProxy(client.useComputedAtom)).toBe(false);
	});

	it("exposes the real $fetch and $store", () => {
		const { client } = createClient();
		expect(isProxy(client.$fetch)).toBe(false);
		expect(isProxy(client.$store.atoms.session)).toBe(false);
	});

	it("useSession resolves the fetched session", async () => {
		const { client } = createClient();
		const { session, dispose } = createRoot((dispose) => ({
			session: client.useSession(),
			dispose,
		}));
		await vi.runAllTimersAsync();
		await expect(resolve(() => session())).resolves.toMatchObject({
			user: { email: "test@email.com" },
		});
		dispose();
	});

	it("useSession().refetch forwards query params", async () => {
		const { client, sessionRequests } = createClient();
		const { session, dispose } = createRoot((dispose) => ({
			session: client.useSession(),
			dispose,
		}));
		await vi.runAllTimersAsync();
		const refetching = session.refetch({ query: { disableCookieCache: true } });
		await vi.runAllTimersAsync();
		await refetching;
		expect(sessionRequests().at(-1)).toContain("disableCookieCache=true");
		dispose();
	});

	it("remounting within the unmount delay does not refetch", async () => {
		const { client, sessionRequests } = createClient();
		const first = createRoot((dispose) => ({
			session: client.useSession(),
			dispose,
		}));
		await vi.advanceTimersByTimeAsync(10);
		await expect(resolve(() => first.session())).resolves.not.toBeNull();
		first.dispose();
		await vi.advanceTimersByTimeAsync(500);
		const second = createRoot((dispose) => ({
			session: client.useSession(),
			dispose,
		}));
		await vi.advanceTimersByTimeAsync(10);
		await expect(resolve(() => second.session())).resolves.not.toBeNull();
		expect(sessionRequests()).toHaveLength(1);
		second.dispose();
	});

	it("useSession without an owner is readable", async () => {
		const { client } = createClient();
		const session = client.useSession();
		await vi.runAllTimersAsync();
		await expect(resolve(() => session())).resolves.toMatchObject({
			user: { id: "1" },
		});
	});

	it("two consumers share one request", async () => {
		const { client, sessionRequests } = createClient();
		const first = createRoot((dispose) => ({
			session: client.useSession(),
			dispose,
		}));
		const second = createRoot((dispose) => ({
			session: client.useSession(),
			dispose,
		}));
		await vi.runAllTimersAsync();
		const [a, b] = await Promise.all([
			resolve(() => first.session()),
			resolve(() => second.session()),
		]);
		expect(a).toMatchObject({ user: { id: "1" } });
		expect(b).toBe(a);
		expect(sessionRequests()).toHaveLength(1);
		first.dispose();
		second.dispose();
	});
});
