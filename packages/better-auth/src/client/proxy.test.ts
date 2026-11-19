// @vitest-environment happy-dom

import { atom } from "nanostores";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { organizationClient } from "../plugins/organization/client";
import { getClientConfig } from "./config";
import { createDynamicPathProxy } from "./proxy";

// Mirrors better-fetch, which runs every onResponse hook before any onSuccess hook.
function fakeFetch() {
	return vi.fn(async (_path: string, options?: { plugins?: any[] }) => {
		const hooks = (options?.plugins ?? []).map((plugin) => plugin.hooks);
		for (const hook of hooks) {
			await hook?.onResponse?.({ response: new Response() });
		}
		for (const hook of hooks) {
			await hook?.onSuccess?.({});
		}
		return {
			data: {},
			error: null,
		};
	});
}

describe("createDynamicPathProxy", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("default atomListeners matcher covers session-rotating endpoints", () => {
		const { atomListeners } = getClientConfig();
		expect(atomListeners).toBeDefined();
		const matcher = atomListeners![0]!.matcher;

		// existing entries (regression coverage)
		expect(matcher("/sign-in/email")).toBe(true);
		expect(matcher("/sign-up/email")).toBe(true);
		expect(matcher("/sign-out")).toBe(true);
		expect(matcher("/change-email")).toBe(true);
		expect(matcher("/revoke-session")).toBe(true);
		expect(matcher("/revoke-sessions")).toBe(true);

		// session-rotating endpoints that must trigger a refetch
		expect(matcher("/change-password")).toBe(true);
		expect(matcher("/revoke-other-sessions")).toBe(true);

		// non-mutating reads should not toggle the signal
		expect(matcher("/get-session")).toBe(false);
		expect(matcher("/list-sessions")).toBe(false);
	});

	it("triggers $sessionSignal toggle through the proxy on /change-password", async () => {
		const client = fakeFetch();

		const signalSet = vi.fn();
		const atoms = {
			$sessionSignal: {
				get: () => false,
				set: signalSet,
				subscribe: () => () => {},
				listen: () => () => {},
				off: () => {},
				value: false,
			} as any,
		};

		const { atomListeners } = getClientConfig();

		const proxy = createDynamicPathProxy(
			{ changePassword: {} },
			client as any,
			{ "/change-password": "POST" },
			atoms,
			atomListeners,
		);

		vi.useFakeTimers();
		await (proxy.changePassword as any)({
			currentPassword: "old",
			newPassword: "new",
			revokeOtherSessions: true,
		});
		vi.runAllTimers();

		expect(client).toHaveBeenCalled();
		expect(signalSet).toHaveBeenCalledTimes(1);
	});

	it("should avoid duplicate signal processing", async () => {
		const client = fakeFetch();
		const knownPathMethods = {
			"/test": "POST",
		} as const;

		const signalSet = vi.fn();
		const signalGet = vi.fn(() => false);

		const atoms = {
			testSignal: {
				get: signalGet,
				set: signalSet,
				subscribe: () => () => {},
				listen: () => () => {},
				off: () => {},
				value: false,
			} as any,
		};
		const atomListeners = [
			{
				matcher: (path: string) => path === "/test",
				signal: "testSignal",
			},
			{
				matcher: (path: string) => path === "/test",
				signal: "testSignal",
			},
		];

		const proxy = createDynamicPathProxy(
			{
				test: {},
			},
			client as any,
			knownPathMethods,
			atoms,
			atomListeners,
		);

		vi.useFakeTimers();

		await (proxy.test as any)();

		expect(client).toHaveBeenCalled();

		vi.runAllTimers();

		expect(signalSet).toHaveBeenCalledTimes(1);

		vi.useRealTimers();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9710
	 */
	it("refreshes the organization signal once for auth and organization paths", async () => {
		const { $fetch, pluginPathMethods, pluginsAtoms, atomListeners } =
			getClientConfig({
				baseURL: "http://localhost:3000",
				fetchOptions: {
					customFetchImpl: async () => Response.json({}),
				},
				plugins: [organizationClient()],
			});

		const activeOrgSignal = pluginsAtoms.$activeOrgSignal;
		if (!activeOrgSignal) throw new Error("Active org signal missing");
		const updates = vi.fn();
		onTestFinished(activeOrgSignal.listen(updates));

		const proxy = createDynamicPathProxy(
			{} as {
				signIn: { email: () => Promise<unknown> };
				signUp: { email: () => Promise<unknown> };
				organization: { setActive: () => Promise<unknown> };
			},
			$fetch,
			pluginPathMethods,
			pluginsAtoms,
			atomListeners,
		);

		await proxy.signIn.email();
		await vi.waitFor(() => expect(updates).toHaveBeenCalledTimes(1));

		await proxy.signUp.email();
		await vi.waitFor(() => expect(updates).toHaveBeenCalledTimes(2));

		await proxy.organization.setActive();
		await vi.waitFor(() => expect(updates).toHaveBeenCalledTimes(3));
	});

	it("refreshes every matched signal when a listener callback throws", async () => {
		const failure = new Error("callback failed");
		const second = atom(false);
		const { $fetch, pluginPathMethods, pluginsAtoms, atomListeners } =
			getClientConfig({
				baseURL: "http://localhost:3000",
				fetchOptions: {
					customFetchImpl: async () => Response.json({}),
				},
				plugins: [
					{
						id: "listeners",
						getAtoms: () => ({
							$first: atom(false),
							$second: second,
						}),
						atomListeners: [
							{
								signal: "$first",
								matcher: (path) => path === "/sign-in/email",
								callback() {
									throw failure;
								},
							},
							{
								signal: "$second",
								matcher: (path) => path === "/sign-in/email",
							},
						],
					},
				],
			});
		const updates = vi.fn();
		onTestFinished(second.listen(updates));

		const proxy = createDynamicPathProxy(
			{} as { signIn: { email: () => Promise<unknown> } },
			$fetch,
			pluginPathMethods,
			pluginsAtoms,
			atomListeners,
		);

		await expect(proxy.signIn.email()).rejects.toBe(failure);
		expect(updates).toHaveBeenCalledTimes(1);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11727
	 */
	it("sends the method passed in second-argument fetch options", async () => {
		const { $fetch, pluginPathMethods, pluginsAtoms, atomListeners } =
			getClientConfig({
				baseURL: "http://localhost:3000",
				fetchOptions: {
					customFetchImpl: async (input, init) =>
						Response.json({ method: new Request(input, init).method }),
				},
			});
		const proxy = createDynamicPathProxy(
			{} as {
				probe: (
					body: { value?: string },
					options: { method: string },
				) => Promise<{ data: unknown }>;
			},
			$fetch,
			pluginPathMethods,
			pluginsAtoms,
			atomListeners,
		);

		const post = await proxy.probe({}, { method: "POST" });
		const get = await proxy.probe({ value: "example" }, { method: "GET" });

		expect(post.data).toEqual({ method: "POST" });
		expect(get.data).toEqual({ method: "GET" });
		await expect(proxy.probe({}, { method: "get" })).resolves.toMatchObject({
			data: { method: "GET" },
		});
	});
});
