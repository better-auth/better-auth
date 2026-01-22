import type { BetterAuthPlugin } from "@better-auth/core";
import { describe, expect, expectTypeOf } from "vitest";
import { createAuthEndpoint, organization, twoFactor } from "../plugins";
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
	// biome-ignore lint/correctness/noUnusedVariables: AuthOptions and Options need to be same as declared in the module
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"test-type-plugin": {
			creator: Options extends TestTypeOptions
				? typeof createTestTypePlugin<Options>
				: never;
		};
	}
}

describe("general types", async (it) => {
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
