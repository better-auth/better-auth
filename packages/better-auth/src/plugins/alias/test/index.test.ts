import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../../test-utils/test-instance";
import { alias } from "..";
import { createMockClientPlugin, createMockPlugin } from "./mock-plugin";
import { createAuthClient } from "../../../client";
import { aliasClient } from "../client";

describe("Alias Plugin", async () => {
	const { auth, customFetchImpl } = await getTestInstance({
		plugins: [
			alias("/polar", createMockPlugin("polar"), {
				unstable_prefixEndpointMethods: true,
			}),
			alias("/stripe", createMockPlugin("payment"), {
				unstable_prefixEndpointMethods: true,
			}),
			alias("/dodo", createMockPlugin("payment"), {
				unstable_prefixEndpointMethods: true,
			}),
		],
	});

	const client = createAuthClient({
		fetchOptions: {
			customFetchImpl,
		},
		baseURL: "http://localhost:3000",
		plugins: [
			aliasClient("/polar", createMockClientPlugin("polar")),
			aliasClient("/stripe", createMockClientPlugin("payment")),
			aliasClient("/dodo", createMockClientPlugin("payment")),
		],
	});

	it("should call the correct aliased action", async () => {
		expect(client.polar.customAction()).toBe("action-result");
		expect(client.stripe.customAction()).toBe("action-result");
		expect(client.dodo.anotherAction("test")).toBe("result-test");
	});

	it("should prefix server endpoints correctly", async () => {
		expect(auth.api.dodoCheckout.path).toBe("/dodo/checkout");
		expect(auth.api.stripeCustomerPortal.path).toBe("/stripe/customer/portal");
	});

	it("should preserve special endpoints behavior", async () => {
		// TODO:
	});

	it("should resolve fetch URLs with prefixed paths", async () => {
		const spyFetch = vi.fn(customFetchImpl);
		const customClient = createAuthClient({
			fetchOptions: {
				customFetchImpl: spyFetch,
			},
			baseURL: "http://localhost:3000",
			plugins: [aliasClient("/polar", createMockClientPlugin("polar"))],
		});

		await customClient.polar.checkout({
			amount: 1,
		});
		expect(spyFetch).toHaveBeenCalled();
		const calledUrl = spyFetch.mock.calls[0]?.[0].toString();
		expect(calledUrl).toContain("/polar/checkout");
	});

	it("", async () => {
		const res = await client.stripe.customer.portal();
		expect(res.data?.portal).toBe("url");

		const res2 = await client.stripe.checkout({
			amount: 3,
		});
		expect(res2.data?.success).toBe(true);

		const serverRes = await auth.api.stripeCheckout({
			body: {
				amount: 3,
			},
		});
		expect(serverRes.success).toBe(true);
		const test = await alias(
			"/test",
			createMockPlugin("stripe"),
		).endpoints.checkout({
			body: {
				amount: 3,
			},
		});

		expect(test.success).toBe(true);
	});

	it("should handle nested prefixes consistently", async () => {
		const nestedClient = createAuthClient({
			fetchOptions: { customFetchImpl },
			baseURL: "http://localhost:3000",
			plugins: [
				aliasClient(
					"/v1",
					aliasClient("/polar", createMockClientPlugin("polar")),
				),
			],
		});

		// TODO:

		expect(nestedClient.v1.polar.anotherAction("test")).toEqual("result-test");
	});
});
