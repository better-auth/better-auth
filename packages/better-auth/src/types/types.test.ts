import type {
	BetterAuthOptions,
	BetterAuthPlugin,
	UserProvisioningSource,
	ValidateUserInfoOAuthInfo,
	ValidateUserInfoSource,
	ValidateUserInfoSSOInfo,
} from "@better-auth/core";
import type { GoogleProfile, JoinConfig, JoinOption } from "better-auth/types";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createAuthEndpoint } from "../api";
import { betterAuth } from "../auth/minimal";
import type { InferCtx } from "../client/path-to-object";
import { tanstackStartCookies } from "../integrations/tanstack-start";
import { admin, organization, twoFactor } from "../plugins";
import type { GenericOAuthConfig } from "../plugins/generic-oauth";
import { getTestInstance } from "../test-utils/test-instance";
import type { Auth } from "./auth";
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

	interface UserProvisioningSourceRegistry {
		"test-provisioning": {
			tenantId: string;
		};
	}
}

describe("general types", async () => {
	it("narrows provisioning metadata by authentication method", () => {
		function inspectSource(source: UserProvisioningSource) {
			if (source.method === "oauth") {
				expectTypeOf(source.oauth).toEqualTypeOf<ValidateUserInfoOAuthInfo>();
				expectTypeOf(source.sso).toEqualTypeOf<undefined>();
				return;
			}
			if (source.method === "sso-oidc" || source.method === "sso-saml") {
				expectTypeOf(source.sso).toEqualTypeOf<ValidateUserInfoSSOInfo>();
				expectTypeOf(source.oauth).toEqualTypeOf<undefined>();
				return;
			}
			if (source.method === "test-provisioning") {
				expectTypeOf(source.tenantId).toEqualTypeOf<string>();
				expectTypeOf(source.oauth).toEqualTypeOf<undefined>();
				expectTypeOf(source.sso).toEqualTypeOf<undefined>();
				return;
			}
			expectTypeOf(source.oauth).toEqualTypeOf<undefined>();
			expectTypeOf(source.sso).toEqualTypeOf<undefined>();
		}

		inspectSource({
			method: "oauth",
			oauth: { providerId: "google" },
		});
		inspectSource({
			method: "sso-saml",
			sso: { providerId: "workforce" },
		});
		inspectSource({ method: "email-password" });
		inspectSource({ method: "test-provisioning", tenantId: "tenant-1" });

		const validationSource = {
			action: "sign-in",
			method: "oauth",
			oauth: { providerId: "github" },
		} satisfies ValidateUserInfoSource;
		expectTypeOf(validationSource.action).toEqualTypeOf<"sign-in">();

		// @ts-expect-error OAuth provisioning requires OAuth metadata.
		const missingOAuthMetadata: UserProvisioningSource = { method: "oauth" };
		// @ts-expect-error OAuth provisioning cannot carry SSO metadata.
		const oauthWithSSOMetadata: UserProvisioningSource = {
			method: "oauth",
			oauth: { providerId: "github" },
			sso: { providerId: "workforce" },
		};
		// @ts-expect-error SSO provisioning requires SSO metadata.
		const missingSSOMetadata: UserProvisioningSource = { method: "sso-oidc" };
		// @ts-expect-error Core provisioning methods cannot carry provider metadata.
		const passwordWithOAuthMetadata: UserProvisioningSource = {
			method: "email-password",
			oauth: { providerId: "github" },
		};
		// @ts-expect-error Plugin provisioning requires its registered metadata.
		const missingPluginMetadata: UserProvisioningSource = {
			method: "test-provisioning",
		};
		// @ts-expect-error Validation sources require a lifecycle action.
		const missingValidationAction: ValidateUserInfoSource = {
			method: "oauth",
			oauth: { providerId: "github" },
		};

		void missingOAuthMetadata;
		void oauthWithSSOMetadata;
		void missingSSOMetadata;
		void passwordWithOAuthMetadata;
		void missingPluginMetadata;
		void missingValidationAction;
	});

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

/**
 * @see https://github.com/better-auth/better-auth/issues/8823
 */
describe("plugin types through factory and indirection patterns", () => {
	it("preserves endpoint types through factory ReturnType", () => {
		const createAuth = () =>
			betterAuth({
				plugins: [admin()],
			});
		type Auth = ReturnType<typeof createAuth>;

		const auth = createAuth();
		expectTypeOf(auth.api.createUser).toBeFunction();
		expectTypeOf(auth.api.listUsers).toBeFunction();
		expectTypeOf<Auth["api"]["createUser"]>().toBeFunction();
		expectTypeOf<Auth["api"]["listUsers"]>().toBeFunction();
	});

	it("preserves endpoint types when options are stored in a variable", () => {
		const opts = { plugins: [admin()] };
		const auth = betterAuth(opts);
		expectTypeOf(auth.api.createUser).toBeFunction();
		expectTypeOf(auth.api.listUsers).toBeFunction();
	});

	it("preserves endpoint types with mixed-shape plugins", () => {
		const auth = betterAuth({
			plugins: [admin(), organization(), tanstackStartCookies()],
		});
		expectTypeOf(auth.api.createUser).toBeFunction();
		expectTypeOf(auth.api.createOrganization).toBeFunction();
	});

	it("preserves $ERROR_CODES through factory ReturnType", () => {
		const createAuth = () => betterAuth({ plugins: [admin()] });
		type Codes = ReturnType<typeof createAuth>["$ERROR_CODES"];
		expectTypeOf<Codes>().not.toBeAny();
		expectTypeOf<Codes>().toHaveProperty("SESSION_EXPIRED");
		expectTypeOf<Codes>().toHaveProperty("USER_ALREADY_EXISTS");
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/6876
 */
describe("public type exports", () => {
	it("should export JoinOption from better-auth/types", () => {
		expectTypeOf<JoinOption>().not.toBeAny();
	});

	it("should export JoinConfig from better-auth/types", () => {
		expectTypeOf<JoinConfig>().not.toBeAny();
	});

	it("should export GoogleProfile from better-auth/types", () => {
		expectTypeOf<GoogleProfile>().not.toBeAny();
	});

	it("keeps Generic OAuth profile mapping separate from provider identity", () => {
		const config: GenericOAuthConfig = {
			providerId: "company-oauth",
			clientId: "client-id",
			identitySubject: ({ profile }) => String(profile.employee_id),
			// @ts-expect-error Provider identity belongs in identitySubject.
			mapProfileToUser: () => ({ id: "provider-subject" }),
		};
		expectTypeOf(config.identitySubject).not.toBeAny();
	});

	it("requires Generic OAuth account identity to be resolved from provider data", () => {
		const config: GenericOAuthConfig = {
			providerId: "company-oauth",
			clientId: "client-id",
			// @ts-expect-error A static subject would assign every provider user one identity.
			accountSubject: "employee-123",
		};
		expectTypeOf(config).not.toBeAny();
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

	it("InferCtx should preserve each branch of a union body", () => {
		type Result = InferCtx<
			{
				body: { accountId: string } | { useAccountCookie: true };
				query: undefined;
				method: "POST";
			},
			{}
		>;
		type AccountIdSelection = Extract<Result, { accountId: string }>;
		type AccountCookieSelection = Extract<Result, { useAccountCookie: true }>;
		expectTypeOf<AccountIdSelection["accountId"]>().toEqualTypeOf<string>();
		expectTypeOf<AccountIdSelection>().not.toHaveProperty("useAccountCookie");
		expectTypeOf<
			AccountCookieSelection["useAccountCookie"]
		>().toEqualTypeOf<true>();
		expectTypeOf<AccountCookieSelection>().not.toHaveProperty("accountId");
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
