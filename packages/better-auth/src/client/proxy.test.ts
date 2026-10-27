// @vitest-environment happy-dom

import type { ClientFetchOption } from "@better-auth/core";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { organizationClient } from "../plugins/organization/client";
import { getClientConfig } from "./config";
import { createDynamicPathProxy } from "./proxy";

/**
 * @see https://github.com/better-auth/better-auth/issues/11727
 */
describe("request method options", () => {
	type RequestArgs = {
		value?: string;
		query?: Record<string, string>;
		fetchOptions?: ClientFetchOption;
	};

	function getProxy(knownPathMethods: Record<string, "GET" | "POST"> = {}) {
		const customFetchImpl = vi.fn(async () => Response.json({ ok: true }));
		const { $fetch } = getClientConfig({
			baseURL: "http://localhost:3000",
			fetchOptions: { customFetchImpl },
		});
		const proxy = createDynamicPathProxy(
			{} as {
				test: (
					args?: RequestArgs,
					options?: ClientFetchOption,
				) => Promise<unknown>;
			},
			$fetch,
			knownPathMethods,
			{},
			undefined,
		);
		return { proxy, customFetchImpl };
	}

	it.each([
		{ method: "POST", args: {}, body: "{}" },
		{ method: "PATCH", args: { value: "test" }, body: '{"value":"test"}' },
		{ method: "GET", args: { value: "test" }, body: null },
	])("uses $method from the second argument", async ({
		method,
		args,
		body,
	}) => {
		const { proxy, customFetchImpl } = getProxy();
		await proxy.test(args, { method });
		expect(customFetchImpl).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ method, body }),
		);
	});

	it("includes a body supplied in the second argument", async () => {
		const { proxy, customFetchImpl } = getProxy();
		await proxy.test(undefined, { method: "POST", body: { value: "test" } });
		expect(customFetchImpl).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ method: "POST", body: '{"value":"test"}' }),
		);
	});

	it.each([
		{ method: "POST", args: {} },
		{ method: "GET", args: { value: "test" } },
	])("uses $method from nested fetch options", async ({ method, args }) => {
		const { proxy, customFetchImpl } = getProxy();
		await proxy.test({ ...args, fetchOptions: { method } });
		expect(customFetchImpl).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ method }),
		);
	});

	it("prefers nested fetch options when both arguments specify a method", async () => {
		const { proxy, customFetchImpl } = getProxy();
		await proxy.test({ fetchOptions: { method: "POST" } }, { method: "GET" });
		expect(customFetchImpl).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ method: "POST" }),
		);
	});

	/**
	 * @see https://fetch.spec.whatwg.org/#concept-method-normalize
	 */
	it.each([
		["FoO", false],
		["FoO", true],
		["post", false],
		["post", true],
		["POST", false],
		["POST", true],
	] as const)("preserves %s for fetch plugin initialization (nested: %s)", async (method, nested) => {
		const methods: (string | undefined)[] = [];
		const options: ClientFetchOption = {
			method,
			plugins: [
				{
					id: "method-observer",
					name: "Method observer",
					init(url, initOptions) {
						methods.push(initOptions?.method);
						return { url, options: initOptions };
					},
				},
			],
		};
		const { proxy } = getProxy();
		if (nested) {
			await proxy.test({ value: "test", fetchOptions: options });
		} else {
			await proxy.test({ value: "test" }, options);
		}
		expect(methods).toEqual([method]);
	});

	it.each([
		"GET",
		"POST",
	] as const)("preserves the known %s method over request options", async (method) => {
		const { proxy, customFetchImpl } = getProxy({ "/test": method });
		const otherMethod = method === "GET" ? "POST" : "GET";
		await proxy.test(
			{ fetchOptions: { method: otherMethod } },
			{ method: otherMethod },
		);
		expect(customFetchImpl).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ method }),
		);
	});

	it.each([
		{ args: {}, method: "GET" },
		{ args: { value: "test" }, method: "POST" },
	])("still infers $method without an explicit method", async ({
		args,
		method,
	}) => {
		const { proxy, customFetchImpl } = getProxy();
		await proxy.test(args);
		expect(customFetchImpl).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ method }),
		);
	});
});

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
		const client = vi.fn(async (path, options) => {
			if (options?.onSuccess) {
				await options.onSuccess({} as any);
			}
			return {
				data: {},
				error: null,
			};
		});

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
		const client = vi.fn(async (path, options) => {
			if (options?.onSuccess) {
				await options.onSuccess({} as any);
			}
			return {
				data: {},
				error: null,
			};
		});
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
});
