import { oauthProvider } from "@better-auth/oauth-provider";
import { passkey } from "@better-auth/passkey";
import { stripe } from "@better-auth/stripe";
import { LibsqlDialect } from "@libsql/kysely-libsql";
import type { BetterAuthOptions } from "better-auth";
import { APIError, betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import type { Organization } from "better-auth/plugins";
import {
	admin,
	bearer,
	customSession,
	deviceAuthorization,
	jwt,
	lastLoginMethod,
	multiSession,
	oAuthProxy,
	oneTap,
	openAPI,
	organization,
	twoFactor,
} from "better-auth/plugins";
import { MysqlDialect } from "kysely";
import { createPool } from "mysql2/promise";
import { Stripe } from "stripe";
import { reactInvitationEmail } from "./email/invitation";
import { resend } from "./email/resend";
import { reactResetPasswordEmail } from "./email/reset-password";

const from = process.env.BETTER_AUTH_EMAIL || "delivered@resend.dev";
const to = process.env.TEST_EMAIL || "";

const dialect = (() => {
	if (process.env.USE_MYSQL) {
		if (!process.env.MYSQL_DATABASE_URL) {
			throw new Error(
				"Using MySQL dialect without MYSQL_DATABASE_URL. Please set it in your environment variables.",
			);
		}
		return new MysqlDialect(createPool(process.env.MYSQL_DATABASE_URL || ""));
	} else {
		if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
			return new LibsqlDialect({
				url: process.env.TURSO_DATABASE_URL,
				authToken: process.env.TURSO_AUTH_TOKEN,
			});
		}
	}
	return null;
})();

if (!dialect) {
	throw new Error("No dialect found");
}

const authOptions = {
	appName: "Better Auth Demo",
	database: {
		dialect,
		type: "sqlite",
	},
	emailVerification: {
		async sendVerificationEmail({ user, url }) {
			const res = await resend.emails.send({
				from,
				to: to || user.email,
				subject: "Verify your email address",
				html: `<a href="${url}">Verify your email address</a>`,
			});
			console.log(res, user.email);
		},
	},
	account: {
		accountLinking: {
			trustedProviders: ["google", "github", "demo-app", "sso"],
		},
	},
	emailAndPassword: {
		enabled: true,
		async sendResetPassword({ user, url }) {
			await resend.emails.send({
				from,
				to: user.email,
				subject: "Reset your password",
				react: reactResetPasswordEmail({
					username: user.email,
					resetLink: url,
				}),
			});
		},
	},
	socialProviders: {
		facebook: {
			clientId: process.env.FACEBOOK_CLIENT_ID || "",
			clientSecret: process.env.FACEBOOK_CLIENT_SECRET || "",
		},
		github: {
			clientId: process.env.GITHUB_CLIENT_ID || "",
			clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
		},
		google: {
			clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "",
			clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
		},
		discord: {
			clientId: process.env.DISCORD_CLIENT_ID || "",
			clientSecret: process.env.DISCORD_CLIENT_SECRET || "",
		},
		microsoft: {
			clientId: process.env.MICROSOFT_CLIENT_ID || "",
			clientSecret: process.env.MICROSOFT_CLIENT_SECRET || "",
		},
		twitch: {
			clientId: process.env.TWITCH_CLIENT_ID || "",
			clientSecret: process.env.TWITCH_CLIENT_SECRET || "",
		},
		twitter: {
			clientId: process.env.TWITTER_CLIENT_ID || "",
			clientSecret: process.env.TWITTER_CLIENT_SECRET || "",
		},
		paypal: {
			clientId: process.env.PAYPAL_CLIENT_ID || "",
			clientSecret: process.env.PAYPAL_CLIENT_SECRET || "",
		},
		vercel: {
			clientId: process.env.VERCEL_CLIENT_ID || "",
			clientSecret: process.env.VERCEL_CLIENT_SECRET || "",
		},
	},
	plugins: [
		organization({
			async sendInvitationEmail(data) {
				await resend.emails.send({
					from,
					to: data.email,
					subject: "You've been invited to join an organization",
					react: reactInvitationEmail({
						username: data.email,
						invitedByUsername: data.inviter.user.name,
						invitedByEmail: data.inviter.user.email,
						teamName: data.organization.name,
						inviteLink:
							process.env.NODE_ENV === "development"
								? `http://localhost:3000/accept-invitation/${data.id}`
								: `${
										process.env.BETTER_AUTH_URL ||
										"https://demo.better-auth.com"
									}/accept-invitation/${data.id}`,
					}),
				});
			},
		}),
		twoFactor({
			otpOptions: {
				async sendOTP({ user, otp }) {
					await resend.emails.send({
						from,
						to: user.email,
						subject: "Your OTP",
						html: `Your OTP is ${otp}`,
					});
				},
			},
		}),
		passkey(),
		openAPI(),
		bearer(),
		admin({
			/* cspell:disable-next-line */
			adminUserIds: ["EXD5zjob2SD6CBWcEQ6OpLRHcyoUbnaB"],
		}),
		multiSession(),
		oAuthProxy({
			productionURL:
				process.env.BETTER_AUTH_URL || "https://demo.better-auth.com",
		}),
		nextCookies(),
		oneTap(),
		stripe({
			stripeClient: new Stripe(process.env.STRIPE_KEY || "sk_test_"),
			stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
			subscription: {
				enabled: true,
				allowReTrialsForDifferentPlans: true,
				plans: () => {
					const PRO_PRICE_ID = {
						default:
							process.env.STRIPE_PRO_PRICE_ID ??
							"price_1RoxnRHmTADgihIt4y8c0lVE",
						annual:
							process.env.STRIPE_PRO_ANNUAL_PRICE_ID ??
							"price_1RoxnoHmTADgihItzFvVP8KT",
					};
					const PLUS_PRICE_ID = {
						default:
							process.env.STRIPE_PLUS_PRICE_ID ??
							"price_1RoxnJHmTADgihIthZTLmrPn",
						annual:
							process.env.STRIPE_PLUS_ANNUAL_PRICE_ID ??
							"price_1Roxo5HmTADgihItEbJu5llL",
					};

					return [
						{
							name: "Plus",
							priceId: PLUS_PRICE_ID.default,
							annualDiscountPriceId: PLUS_PRICE_ID.annual,
							freeTrial: {
								days: 7,
							},
						},
						{
							name: "Pro",
							priceId: PRO_PRICE_ID.default,
							annualDiscountPriceId: PRO_PRICE_ID.annual,
							freeTrial: {
								days: 7,
							},
						},
					];
				},
			},
		}),
		deviceAuthorization({
			expiresIn: "3min",
			interval: "5s",
		}),
		lastLoginMethod(),
		jwt({
			jwt: {
				issuer: process.env.BETTER_AUTH_URL,
			},
		}),
		oauthProvider({
			loginPage: "/sign-in",
			consentPage: "/oauth/consent",
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
			scopes: [
				"openid",
				"profile",
				"email",
				"offline_access",
				"read:organization",
			],
			validAudiences: [
				process.env.BETTER_AUTH_URL || "https://demo.better-auth.com",
				(process.env.BETTER_AUTH_URL || "https://demo.better-auth.com") +
					"/api/mcp",
			],
			selectAccount: {
				page: "/oauth/select-account",
				shouldRedirect: async ({ headers }) => {
					const allSessions = await getAllDeviceSessions(headers);
					return allSessions?.length >= 1;
				},
			},
			customAccessTokenClaims({ referenceId, scopes }) {
				if (referenceId && scopes.includes("read:organization")) {
					const baseUrl =
						process.env.BETTER_AUTH_URL || "https://demo.better-auth.com";
					return {
						[`${baseUrl}/org`]: referenceId,
					};
				}
				return {};
			},
			postLogin: {
				page: "/oauth/select-organization",
				async shouldRedirect({ session, scopes, headers }) {
					const userOnlyScopes = [
						"openid",
						"profile",
						"email",
						"offline_access",
					];
					if (scopes.every((sc) => userOnlyScopes.includes(sc))) {
						return false;
					}
					// Check if user has multiple organizations to select from
					try {
						const organizations = (await getAllUserOrganizations(
							headers,
						)) as Organization[];
						return (
							organizations.length > 1 ||
							!(
								organizations.length === 1 &&
								organizations.at(0)?.id === session.activeOrganizationId
							)
						);
					} catch {
						return true;
					}
				},
				consentReferenceId({ session, scopes }) {
					if (scopes.includes("read:organization")) {
						const activeOrganizationId = (session?.activeOrganizationId ??
							undefined) as string | undefined;
						if (!activeOrganizationId) {
							throw new APIError("BAD_REQUEST", {
								error: "set_organization",
								error_description: "must set organization for these scopes",
							});
						}
						return activeOrganizationId;
					} else {
						return undefined;
					}
				},
			},
			silenceWarnings: {
				openidConfig: true,
				oauthAuthServerConfig: true,
			},
		}),
	],
	trustedOrigins: [
		"https://*.better-auth.com",
		"https://better-auth-demo-*-better-auth.vercel.app",
		"exp://",
		"https://appleid.apple.com",
	],
} satisfies BetterAuthOptions;

export const auth = betterAuth({
	...authOptions,
	plugins: [
		...(authOptions.plugins ?? []),
		customSession(
			async ({ user, session }) => {
				return {
					user: {
						...user,
						customField: "customField",
					},
					session,
				};
			},
			authOptions,
			{ shouldMutateListDeviceSessionsEndpoint: true },
		),
	],
});

export type Session = typeof auth.$Infer.Session;
export type ActiveOrganization = typeof auth.$Infer.ActiveOrganization;
export type OrganizationRole = ActiveOrganization["members"][number]["role"];
export type Invitation = typeof auth.$Infer.Invitation;
export type DeviceSession = Awaited<
	ReturnType<typeof auth.api.listDeviceSessions>
>[number];

async function getAllDeviceSessions(headers: Headers): Promise<unknown[]> {
	return await auth.api.listDeviceSessions({
		headers,
	});
}

async function getAllUserOrganizations(headers: Headers): Promise<unknown[]> {
	return await auth.api.listOrganizations({
		headers,
	});
}
