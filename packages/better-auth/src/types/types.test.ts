import type { BetterAuthPlugin } from "@better-auth/core";
import type { InputContext } from "better-call";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createAuthEndpoint } from "../api";
import type { InferCtx } from "../client/path-to-object";
import { organization, twoFactor } from "../plugins";
import { getTestInstance } from "../test-utils/test-instance";
import type { HasRequiredKeys } from "./helper";

type TestTypeOptions = {
	test: boolean;
};

const pingEndpoint = createAuthEndpoint(
	"/test-type-ping",
	{
		method: "GET",
	},
	async (ctx) => {
		return ctx.json({
			message: "pong",
		});
	},
);

const createTestTypePlugin = <O extends TestTypeOptions>(options?: O) =>
	({
		id: "test-type-plugin" as const,
		endpoints: {
			pingEndpoint,
		} as O extends {
			test: true;
		}
			? {
					pingEndpoint: typeof pingEndpoint;
				}
			: {},
		options: options as NoInfer<O>,
	}) satisfies BetterAuthPlugin;

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"test-type-plugin": {
			creator: Options extends TestTypeOptions
				? typeof createTestTypePlugin<Options>
				: never;
		};
	}
}

describe("general types", async () => {
	it("should infer base session", async () => {
		const { auth } = await getTestInstance();
		type Session = typeof auth.$Infer.Session;
		expectTypeOf<Session>().toEqualTypeOf<{
			session: {
				id: string;
				createdAt: Date;
				updatedAt: Date;
				userId: string;
				expiresAt: Date;
				token: string;
				ipAddress?: string | null | undefined;
				userAgent?: string | null | undefined;
			};
			user: {
				id: string;
				createdAt: Date;
				updatedAt: Date;
				email: string;
				emailVerified: boolean;
				name: string;
				image?: string | null | undefined;
			};
		}>();
	});

	it("should match plugin type", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				twoFactor(),
				createTestTypePlugin({
					test: true,
				}),
			],
		});

		const context = await auth.$context;
		type TwoFactorPlugin = ReturnType<typeof twoFactor>;
		const id = "two-factor";
		const twoFactorPlugin = context.getPlugin(id)!;
		const hasTwoFactorPlugin = context.hasPlugin(id);
		const nonExistPlugin = context.hasPlugin("non-exist-plugin");
		expectTypeOf(hasTwoFactorPlugin).toEqualTypeOf<true>();
		expectTypeOf(nonExistPlugin).toEqualTypeOf<boolean>();
		expect(twoFactorPlugin).toBeDefined();
		expect(twoFactorPlugin.id).toBe(id);
		type TwoFactorPluginFromContext = typeof twoFactorPlugin;
		expectTypeOf<TwoFactorPluginFromContext>().toMatchObjectType<TwoFactorPlugin>();
		const testTypePlugin = context.getPlugin("test-type-plugin")!;
		type PingEndpointFromPlugin = typeof testTypePlugin.endpoints.pingEndpoint;
		expectTypeOf<PingEndpointFromPlugin>().toEqualTypeOf(pingEndpoint);
	});

	it("should infer the types of server scoped endpoints", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				{
					id: "test-plugin",
					endpoints: {
						testVirtual: createAuthEndpoint(
							{
								method: "GET",
							},
							async () => "ok",
						),
						testServerScoped: createAuthEndpoint(
							"/test-server-scoped",
							{
								method: "GET",
								metadata: {
									scope: "server",
								},
							},
							async () => "ok",
						),
						testHTTPScoped: createAuthEndpoint(
							"/test-http-scoped",
							{
								method: "GET",
								metadata: {
									scope: "http",
								},
							},
							async () => "ok",
						),
						testNonAction: createAuthEndpoint(
							"/test-non-action",
							{
								method: "GET",
								metadata: {
									isAction: false,
								},
							},
							async () => "ok",
						),
					},
				},
			],
		});
		expectTypeOf<typeof auth.api>().toHaveProperty("testServerScoped");
		expectTypeOf<typeof auth.api>().toHaveProperty("testVirtual");
		expectTypeOf<typeof auth.api>().not.toHaveProperty("testHTTPScoped");
		expectTypeOf<typeof auth.api>().not.toHaveProperty("testNonAction");
	});

	it("should infer additional fields from plugins", async () => {
		const { auth } = await getTestInstance({
			plugins: [twoFactor(), organization()],
		});
		expectTypeOf<typeof auth.$Infer.Session.user>().toEqualTypeOf<{
			id: string;
			email: string;
			emailVerified: boolean;
			name: string;
			image?: string | undefined | null;
			createdAt: Date;
			updatedAt: Date;
			twoFactorEnabled: boolean | undefined | null;
		}>();

		expectTypeOf<typeof auth.$Infer.Session.session>().toMatchObjectType<{
			id: string;
			userId: string;
			expiresAt: Date;
			createdAt: Date;
			updatedAt: Date;
			token: string;
			ipAddress?: string | undefined | null;
			userAgent?: string | undefined | null;
			activeOrganizationId?: string | undefined | null;
		}>();
	});

	it("should infer plugin-contributed context from init", async () => {
		const testUtilsPlugin = {
			id: "test-utils" as const,
			init() {
				return {
					context: {
						testValue: 42 as number,
						testHelper: () => "hello" as string,
					},
				};
			},
		} satisfies BetterAuthPlugin;

		const { auth } = await getTestInstance({
			plugins: [testUtilsPlugin],
		});

		const context = await auth.$context;
		expectTypeOf(context.testValue).toEqualTypeOf<number>();
		expectTypeOf(context.testHelper).toEqualTypeOf<() => string>();
	});

	it("should infer the same types for empty plugins and no plugins", async () => {
		const { auth: authWithEmptyPlugins } = await getTestInstance({
			plugins: [],
			secret: "test-secret",
			emailAndPassword: {
				enabled: true,
			},
		});

		const { auth: authWithoutPlugins } = await getTestInstance({
			secret: "test-secret",
			emailAndPassword: {
				enabled: true,
			},
		});

		type SessionWithEmptyPlugins = typeof authWithEmptyPlugins.$Infer;
		type SessionWithoutPlugins = typeof authWithoutPlugins.$Infer;

		expectTypeOf<SessionWithEmptyPlugins>().toEqualTypeOf<SessionWithoutPlugins>();
	});
});

describe("HasRequiredKeys", () => {
	it("should return false for any", () => {
		expectTypeOf<HasRequiredKeys<any>>().toEqualTypeOf<false>();
	});

	it("should return true for objects with required keys", () => {
		expectTypeOf<HasRequiredKeys<{ name: string }>>().toEqualTypeOf<true>();
	});

	it("should return false for objects with only optional keys", () => {
		expectTypeOf<HasRequiredKeys<{ name?: string }>>().toEqualTypeOf<false>();
	});
});

describe("InferCtx", () => {
	it("should preserve fetchOptions when body is any", () => {
		type Result = InferCtx<InputContext<any, any> & { body: any }, {}>;
		type Keys = keyof Result;
		expectTypeOf<Keys>().toEqualTypeOf<"fetchOptions">();
	});

	it("should preserve query when body is any", () => {
		type Result = InferCtx<
			{ body: any; query: { page: number }; method: "GET" },
			{}
		>;
		type HasQuery = "query" extends keyof Result ? true : false;
		expectTypeOf<HasQuery>().toEqualTypeOf<true>();
	});
});

describe("any-poisoning guards", () => {
	/**
	 * PrettifyDeep is used in InferSessionAPI return types.
	 * Verify auth.$Infer.Session preserves structure and doesn't collapse.
	 */
	it("auth.$Infer.Session should have typed user/session fields", async () => {
		const { auth } = await getTestInstance();
		type Session = typeof auth.$Infer.Session;
		expectTypeOf<Session>().toHaveProperty("user");
		expectTypeOf<Session>().toHaveProperty("session");
		type User = Session["user"];
		expectTypeOf<User>().toHaveProperty("id");
		expectTypeOf<User>().toHaveProperty("email");
	});

	/**
	 * InferPluginTypes extracts $Infer from each plugin. When a plugin in
	 * the array is `any`, the entire $Infer type should not collapse.
	 */
	it("auth.$Infer should not collapse with untyped plugin", async () => {
		const untypedPlugin = {} as any;
		const { auth } = await getTestInstance({
			plugins: [organization(), untypedPlugin],
		});
		type Infer = typeof auth.$Infer;
		expectTypeOf<Infer>().not.toBeAny();
		expectTypeOf<Infer>().toHaveProperty("Session");
	});

	/**
	 * InferPluginErrorCodes extracts $ERROR_CODES from each plugin.
	 * Same any guard as InferPluginTypes.
	 */
	it("auth.$ERROR_CODES should not collapse with untyped plugin", async () => {
		const untypedPlugin = {} as any;
		const { auth } = await getTestInstance({
			plugins: [organization(), untypedPlugin],
		});
		type Codes = (typeof auth)["$ERROR_CODES"];
		expectTypeOf<Codes>().not.toBeAny();
	});

	/**
	 * InferResolvedHooks transforms plugin atoms to hook methods (useSession, etc.).
	 * Built-in hooks should remain typed regardless of plugin composition.
	 */
	it("client hooks should not collapse with untyped plugin", async () => {
		const { client } = await getTestInstance();
		type UseSession = typeof client.useSession;
		expectTypeOf<UseSession>().not.toBeAny();
	});
});
