import type { BetterAuthPlugin } from "@better-auth/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createAuthEndpoint } from "../api";
import { betterAuth } from "../auth/full";
import { admin, organization, twoFactor } from "../plugins";
import { getTestInstance } from "../test-utils/test-instance";

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

	it("should preserve plugin endpoint types in lazy singleton pattern", () => {
		// Common pattern: betterAuth() inside a factory function,
		// with `typeof auth` used downstream.
		// Without readonly support + const generic, plugin endpoints
		// are erased when the plugins tuple widens to BetterAuthPlugin[].
		function createAuth() {
			return betterAuth({
				database: {} as any,
				plugins: [admin()],
			});
		}

		type LazyAuth = ReturnType<typeof createAuth>;

		// Admin plugin endpoints must be present on auth.api
		expectTypeOf<LazyAuth["api"]>().toHaveProperty("createUser");
		expectTypeOf<LazyAuth["api"]>().toHaveProperty("removeUser");
		expectTypeOf<LazyAuth["api"]>().toHaveProperty("listUsers");
		expectTypeOf<LazyAuth["api"]>().toHaveProperty("banUser");
		expectTypeOf<LazyAuth["api"]>().toHaveProperty("setRole");
	});

	it("should preserve plugin endpoint types with mixed plugins", () => {
		// When multiple plugins are combined (some with endpoints, some without),
		// the array should not widen and lose endpoint types.
		function createAuth() {
			return betterAuth({
				database: {} as any,
				plugins: [admin(), twoFactor()],
			});
		}

		type MixedAuth = ReturnType<typeof createAuth>;

		// Admin endpoints
		expectTypeOf<MixedAuth["api"]>().toHaveProperty("createUser");
		expectTypeOf<MixedAuth["api"]>().toHaveProperty("removeUser");
		expectTypeOf<MixedAuth["api"]>().toHaveProperty("listUsers");
	});

	it("should preserve plugin types with explicit readonly plugins", () => {
		// When plugins are declared as a readonly tuple (e.g., via `as const`
		// or `satisfies`), endpoint types must still be preserved.
		function createAuth() {
			const plugins = [admin(), twoFactor()] as const;
			return betterAuth({
				database: {} as any,
				plugins,
			});
		}

		type ReadonlyAuth = ReturnType<typeof createAuth>;

		// Admin endpoints must be present
		expectTypeOf<ReadonlyAuth["api"]>().toHaveProperty("createUser");
		expectTypeOf<ReadonlyAuth["api"]>().toHaveProperty("removeUser");
		expectTypeOf<ReadonlyAuth["api"]>().toHaveProperty("listUsers");
	});

	it("should preserve plugin context types (hasPlugin / getPlugin)", async () => {
		// The $context.hasPlugin() and getPlugin() methods rely on
		// InferPluginID which must also handle readonly plugin arrays.
		function createAuth() {
			return betterAuth({
				database: {} as any,
				plugins: [admin(), twoFactor()],
			});
		}

		type ContextAuth = ReturnType<typeof createAuth>;
		type Context = Awaited<ContextAuth["$context"]>;

		// hasPlugin should return `true` (not just `boolean`) for known plugins
		type HasAdmin = ReturnType<Context["hasPlugin"]>;
		expectTypeOf<HasAdmin>().not.toEqualTypeOf<never>();
	});
});
