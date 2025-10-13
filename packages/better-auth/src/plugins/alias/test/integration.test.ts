import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { getTestInstance } from "../../../test-utils/test-instance";
import { getTestInstanceMemory } from "../../../test-utils";
import { alias } from "..";
import { createMockClientPlugin, createMockPlugin } from "./mock-plugin";
import { createAuthClient } from "../../../client";
import { aliasClient } from "../client";
import type {
	BetterAuthClientPlugin,
	BetterAuthPlugin,
} from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/middleware";
import z from "zod/v4";

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

	it("should execute aliased client and server endpoints correctly", async () => {
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
	});

	it("should handle nested prefixes consistently", async () => {
		const { customFetchImpl } = await getTestInstanceMemory({
			plugins: [alias("/v1", alias("/polar", createMockPlugin("polar")))],
		});

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

		expect(
			(
				await nestedClient.v1.polar.checkout({
					amount: 3,
				})
			).data,
		).toStrictEqual({
			success: true,
		});

		expect(nestedClient.v1.polar.anotherAction("test")).toEqual("result-test");
	});

	it("should wrap getActions to prefix any path-based actions", async () => {
		const spyFetch = vi.fn(async (req: Request | string | URL) => {
			return new Response(
				JSON.stringify({
					success: true,
				}),
			);
		});

		const client = createAuthClient({
			fetchOptions: {
				customFetchImpl: spyFetch,
			},
			baseURL: "http://localhost:3000",
			plugins: [
				aliasClient("/dodo", createMockClientPlugin("dodo"), {
					excludeEndpoints: ["/other-plugin"],
				}),
			],
		});

		await client.dodo.triggerFetch("/payment/init", "POST");

		expect(spyFetch).toHaveBeenCalledTimes(1);
		let calledURL = spyFetch.mock.calls[0]?.[0];
		expect(calledURL?.toString()).toEqual(
			"http://localhost:3000/api/auth/dodo/payment/init",
		);
		spyFetch.mockClear();

		await client.dodo.triggerFetch("/other-plugin");
		expect(spyFetch).toHaveBeenCalledTimes(1);
		calledURL = spyFetch.mock.calls[0]?.[0];
		expect(calledURL?.toString()).toEqual(
			"http://localhost:3000/api/auth/other-plugin",
		);
	});

	describe("special endpoints", async () => {
		const testPlugin = {
			id: "test-plugin",
			endpoints: {
				signInCustom: createAuthEndpoint(
					"/sign-in/custom",
					{
						method: "POST",
						body: z.object({
							email: z.email(),
							password: z.string(),
						}),
					},
					async (ctx) => {
						return ctx.body.email;
					},
				),
				signUpCustom: createAuthEndpoint(
					"/sign-up/custom",
					{
						method: "POST",
						body: z.object({
							email: z.email(),
							password: z.string(),
						}),
					},
					async (ctx) => {
						return ctx.body.email;
					},
				),
			},
			$Infer: {
				SomeType: {} as {
					success: true;
				},
			},
		} satisfies BetterAuthPlugin;

		const testPluginClient = {
			id: "test-plugin",
			getActions: ($fetch, $store, options) => {
				return {
					$Infer: {
						SomeType: {} as {
							success: true;
						},
					},
					signIn: {
						action: (data: { email: string }) => {
							return data.email;
						},
					},
					signUp: {
						action: (data: { email: string }) => {
							return data.email;
						},
					},
				};
			},
			$InferServerPlugin: {} as typeof testPlugin,
		} satisfies BetterAuthClientPlugin;

		const { auth, customFetchImpl } = await getTestInstanceMemory({
			plugins: [
				alias("/test", testPlugin, {
					prefixTypeInference: true,
				}),
			],
		});

		const client = createAuthClient({
			fetchOptions: {
				customFetchImpl,
			},
			baseURL: "https://localhost:3000",
			plugins: [
				aliasClient("/test", testPluginClient, {
					prefixTypeInference: true,
				}),
			],
		});

		it("should preserve sign-in endpoints", async () => {
			expect(
				(
					await client.signIn.test.custom({
						email: "t1@example.com",
						password: "pass",
					})
				).data,
			).toBe("t1@example.com");

			expect(
				client.signIn.test.action({
					email: "t2@example.com",
				}),
			).toBe("t2@example.com");
		});

		it("should preserve sign-up endpoints", async () => {
			expect(
				(
					await client.signUp.test.custom({
						email: "t3@example.com",
						password: "pass",
					})
				).data,
			).toBe("t3@example.com");

			expect(
				client.signUp.test.action({
					email: "t4@example.com",
				}),
			).toBe("t4@example.com");
		});

		it("should preserve $Infer key", async () => {
			// @ts-expect-error
			expectTypeOf<typeof auth.$Infer.SomeType>().toEqualTypeOf<never>();
			expectTypeOf<typeof auth.$Infer.TestSomeType>().toMatchObjectType<{
				success: true;
			}>();
			// @ts-expect-error
			expectTypeOf<typeof client.$Infer.SomeType>().toEqualTypeOf<never>();
			expectTypeOf<typeof client.$Infer.TestSomeType>().toMatchObjectType<{
				success: true;
			}>();
		});
	});
});
