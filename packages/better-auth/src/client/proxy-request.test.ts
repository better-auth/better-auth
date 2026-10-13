// @vitest-environment node

import type { ClientFetchOption } from "@better-auth/core";
import { describe, expect, it } from "vitest";
import { getClientConfig } from "./config";
import { createDynamicPathProxy } from "./proxy";

/**
 * @see https://github.com/better-auth/better-auth/issues/11727
 * @see https://fetch.spec.whatwg.org/#dom-request
 */
describe("client request construction", () => {
	describe.each([
		"second argument",
		"nested fetch options",
	])("method in %s", (placement) => {
		it.each([
			"GET",
			"get",
			"GeT",
			"HEAD",
			"head",
			"HeAd",
		])("constructs a bodyless %s request", async (method) => {
			const requests: Request[] = [];
			const { $fetch } = getClientConfig({
				baseURL: "http://localhost:3000",
				fetchOptions: {
					customFetchImpl: async (input, init) => {
						requests.push(new Request(input, init));
						return new Response(null, { status: 204 });
					},
				},
			});
			const proxy = createDynamicPathProxy(
				{} as {
					test: (
						args: {
							value: string;
							query: Record<string, string>;
							fetchOptions?: ClientFetchOption;
						},
						options?: ClientFetchOption,
					) => Promise<unknown>;
				},
				$fetch,
				{},
				{},
				undefined,
			);
			const args = { value: "test", query: { page: "1" } };
			const options = { method, body: { other: "test" } };
			if (placement === "second argument") {
				await proxy.test(args, options);
			} else {
				await proxy.test({ ...args, fetchOptions: options });
			}

			expect(requests).toHaveLength(1);
			const request = requests[0]!;
			expect(request.method).toBe(method.toUpperCase());
			expect(request.body).toBeNull();
			expect(new URL(request.url).searchParams.get("page")).toBe("1");
		});
	});
});
