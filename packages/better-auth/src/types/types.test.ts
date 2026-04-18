import type { BetterAuthOptions, BetterAuthPlugin } from "@better-auth/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createAuthEndpoint } from "../api";
import {
	isSignInChallenge,
	isSignInChallengeOfKind,
} from "../auth/sign-in-guards";
import type { InferCtx } from "../client/path-to-object";
import { organization, twoFactor } from "../plugins";
import { username } from "../plugins/username";
import { getTestInstance } from "../test-utils/test-instance";
import type { Auth } from "./auth";
import type { HasRequiredKeys } from "./helper";

type TestTypeOptions = {
	test: boolean;
};

type HasTwoFactorChallengeBranch<T> =
	Extract<
		T,
		{
			kind: "challenge";
			challenge: {
				kind: "two-factor";
				attemptId: string;
				availableMethods: readonly string[];
			};
		}
	> extends never
		? false
		: true;

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
				amr: import("@better-auth/core").AuthenticationMethodReference[];
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

	/**
	 * `Auth<O>["api"].getSession` must remain callable from a generic context.
	 * Changing this contract is a breaking change for downstream consumers.
	 *
	 * @see https://github.com/better-auth/better-auth/pull/8466
	 * @see https://github.com/next-safe-action/next-safe-action/pull/439
	 */
	it("should keep getSession on auth.api when O is a generic parameter", () => {
		async function probe<O extends BetterAuthOptions>(auth: Auth<O>) {
			await auth.api.getSession({ headers: new Headers() });
		}
		void probe;
	});

	/**
	 * A plugin overriding a base endpoint must expose the plugin's type,
	 * not an intersection that leaks base metadata like `options.body`.
	 */
	it("plugin override of base endpoint key should drive auth.api type", async () => {
		const overridePlugin = {
			id: "override-base" as const,
			endpoints: {
				signInEmail: createAuthEndpoint(
					"/sign-in/email",
					{
						method: "POST",
					},
					async (ctx) => {
						return ctx.json({ overriddenMarker: true as const });
					},
				),
			},
		} satisfies BetterAuthPlugin;
		const { auth } = await getTestInstance({ plugins: [overridePlugin] });
		type ApiSignInEmail = (typeof auth.api)["signInEmail"];
		type Ret = Awaited<ReturnType<ApiSignInEmail>>;
		expectTypeOf<Ret>().toEqualTypeOf<{ overriddenMarker: true }>();
		type Body = ApiSignInEmail extends { options: { body: infer B } }
			? B
			: "no-body";
		expectTypeOf<Body>().toEqualTypeOf<"no-body">();
	});

	it("should preserve the two-factor challenge branch for sign-in APIs in multi-plugin configs", async () => {
		const { auth } = await getTestInstance({
			plugins: [twoFactor(), username()],
		});

		type SignInEmailReturn = Awaited<ReturnType<typeof auth.api.signInEmail>>;
		type SignInSocialReturn = Awaited<ReturnType<typeof auth.api.signInSocial>>;

		expectTypeOf<
			HasTwoFactorChallengeBranch<SignInEmailReturn>
		>().toEqualTypeOf<true>();
		expectTypeOf<
			HasTwoFactorChallengeBranch<SignInSocialReturn>
		>().toEqualTypeOf<true>();
	});

	it("narrows sign-in responses via exported guards", async () => {
		const { auth } = await getTestInstance({ plugins: [twoFactor()] });
		type SignInEmailReturn = Awaited<ReturnType<typeof auth.api.signInEmail>>;

		const value = {} as SignInEmailReturn;
		if (isSignInChallenge(value)) {
			expectTypeOf(value.kind).toEqualTypeOf<"challenge">();
			expectTypeOf(value.challenge.kind).toEqualTypeOf<"two-factor">();
		}
		if (isSignInChallengeOfKind(value, "two-factor")) {
			expectTypeOf(value.challenge.attemptId).toEqualTypeOf<string>();
			expectTypeOf(value.challenge.availableMethods).toEqualTypeOf<
				("totp" | "otp" | "backup-code")[]
			>();
		}
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

describe("any-poisoning guards", () => {
	/**
	 * InferCtx: when body is `any`, query typing should be preserved
	 * via InferCtxQuery delegation instead of collapsing to `any`.
	 */
	it("InferCtx should preserve query when body is any", () => {
		type Result = InferCtx<
			{ body: any; query: { page: number }; method: "GET" },
			{}
		>;
		expectTypeOf<Result["query"]>().toEqualTypeOf<{ page: number }>();
	});

	/**
	 * InferPluginTypes: an untyped plugin (`{} as any`) in the plugins array
	 * should not collapse auth.$Infer to `any`.
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
	 * InferPluginErrorCodes: same guard as InferPluginTypes,
	 * auth.$ERROR_CODES should not collapse to `any`.
	 */
	it("auth.$ERROR_CODES should not collapse with untyped plugin", async () => {
		const untypedPlugin = {} as any;
		const { auth } = await getTestInstance({
			plugins: [organization(), untypedPlugin],
		});
		type Codes = (typeof auth)["$ERROR_CODES"];
		expectTypeOf<Codes>().not.toBeAny();
		expectTypeOf<Codes>().toHaveProperty("SESSION_EXPIRED");
	});
});
