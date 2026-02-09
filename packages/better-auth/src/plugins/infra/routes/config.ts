import { createAuthEndpoint } from "better-auth/api";
import type { DBFieldAttribute } from "better-auth/db";
import { jwtMiddleware } from "../jwt";
import type { DashOptionsInternal } from "../types";

function estimateEntropy(str: string): number {
	const unique = new Set(str).size;
	if (unique === 0) return 0;
	return Math.log2(Math.pow(unique, str.length));
}

export const getConfig = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/config",
		{
			method: "GET",
			use: [jwtMiddleware(options)],
		},
		async (ctx) => {
			const advancedOptions = ctx.context.options.advanced as
				| {
						cookies?: Record<
							string,
							{ name?: string; attributes?: { sameSite?: string } }
						>;
						ipAddress?: {
							ipAddressHeaders?: string[];
							disableIpTracking?: boolean;
						};
				  }
				| undefined;

			return {
				socialProviders: Object.keys(ctx.context.options.socialProviders || {}),
				emailAndPassword: ctx.context.options.emailAndPassword,
				plugins: ctx.context.options.plugins?.map((plugin) => {
					return {
						id: plugin.id,
						schema: plugin.schema,
						options: plugin.options,
					};
				}),
				organization: {
					sendInvitationEmailEnabled: !!ctx.context.options.plugins?.find(
						(plugin) => plugin.id === "organization",
					)?.options?.sendInvitationEmail,
				},
				user: {
					fields: Object.keys(ctx.context.options.user?.fields || {}).map(
						(field) => {
							const fieldType = (
								ctx.context.options.user?.fields as Record<
									string,
									DBFieldAttribute
								>
							)?.[field];
							return {
								name: field,
								type: fieldType?.type,
								required: fieldType?.required,
								input: fieldType?.input,
								unique: fieldType?.unique,
								hasDefaultValue: !!fieldType?.defaultValue,
								references: fieldType?.references,
								returned: fieldType?.returned,
								bigInt: fieldType?.bigint,
							};
						},
					),
					additionalFields: Object.keys(
						ctx.context.options.user?.additionalFields || {},
					).map((field) => {
						const fieldType = (
							ctx.context.options.user?.additionalFields as Record<
								string,
								DBFieldAttribute
							>
						)?.[field];
						return {
							name: field,
							type: fieldType?.type,
							required: fieldType?.required,
							input: fieldType?.input,
							unique: fieldType?.unique,
							hasDefaultValue: !!fieldType?.defaultValue,
							references: fieldType?.references,
							returned: fieldType?.returned,
							bigInt: fieldType?.bigint,
						};
					}),
					deleteUserEnabled: !!ctx.context.options.user?.deleteUser?.enabled,
					modelName: ctx.context.options.user?.modelName,
				},
				baseURL: ctx.context.options.baseURL,
				basePath: ctx.context.options.basePath || "/api/auth",
				emailVerification: {
					sendVerificationEmailEnabled:
						!!ctx.context.options.emailVerification?.sendVerificationEmail,
				},
				// Insights-related config data
				insights: {
					hasDatabase: !!ctx.context.options.database,
					cookies: advancedOptions?.cookies
						? Object.entries(advancedOptions.cookies).map(([key, value]) => ({
								key,
								name: value?.name,
								sameSite: value?.attributes?.sameSite,
							}))
						: null,
					hasIpAddressHeaders: !!(
						advancedOptions?.ipAddress?.ipAddressHeaders &&
						advancedOptions.ipAddress.ipAddressHeaders.length > 0
					),
					ipAddressHeaders:
						advancedOptions?.ipAddress?.ipAddressHeaders || null,
					disableIpTracking:
						advancedOptions?.ipAddress?.disableIpTracking || false,
					disableCSRFCheck:
						ctx.context.options.advanced?.disableCSRFCheck || false,
					disableOriginCheck:
						ctx.context.options.advanced?.disableOriginCheck || false,
					allowDifferentEmails:
						(ctx.context.options.account?.accountLinking?.enabled &&
							ctx.context.options.account?.accountLinking
								?.allowDifferentEmails) ||
						false,
					skipStateCookieCheck:
						ctx.context.options.account?.skipStateCookieCheck || false,
					storeStateCookieStrategy:
						ctx.context.options.account?.storeStateStrategy || null,
					cookieCache: {
						enabled: ctx.context.options.session?.cookieCache?.enabled || false,
						strategy:
							(ctx.context.options.session?.cookieCache?.enabled &&
								ctx.context.options.session?.cookieCache?.strategy) ||
							null,
						refreshCache:
							ctx.context.options.session?.cookieCache?.enabled &&
							typeof ctx.context.options.session?.cookieCache?.refreshCache !==
								"undefined"
								? ctx.context.options.session.cookieCache.refreshCache !== false
								: null,
					},
					sessionFreshAge: ctx.context.options.session?.freshAge || null,
					disableVerificationCleanup:
						ctx.context.options.verification?.disableCleanup || false,
					minPasswordLength:
						(ctx.context.options.emailAndPassword?.enabled &&
							ctx.context.options.emailAndPassword?.minPasswordLength) ||
						null,
					maxPasswordLength:
						(ctx.context.options.emailAndPassword?.enabled &&
							ctx.context.options.emailAndPassword?.maxPasswordLength) ||
						null,
					hasRateLimitDisabled:
						ctx.context.options.rateLimit?.enabled === false,
					rateLimitStorage:
						(ctx.context.options.rateLimit?.enabled !== false &&
							!ctx.context.options.rateLimit?.customStorage &&
							ctx.context.options.rateLimit?.storage) ||
						null,
					storeSessionInDatabase:
						ctx.context.options.session?.storeSessionInDatabase === true,
					preserveSessionInDatabase:
						ctx.context.options.session?.preserveSessionInDatabase === true,
					secretEntropy:
						ctx.context.secret === "better-auth-secret-12345678901234567890" ||
						ctx.context.secret.length < 32
							? 0
							: estimateEntropy(ctx.context.secret),
					useSecureCookies:
						typeof ctx.context.options.advanced?.useSecureCookies !==
						"undefined"
							? ctx.context.options.advanced.useSecureCookies
							: null,
					crossSubDomainCookiesEnabled:
						ctx.context.options.advanced?.crossSubDomainCookies?.enabled ||
						false,
					crossSubDomainCookiesDomain:
						ctx.context.options.advanced?.crossSubDomainCookies?.domain,
					defaultCookieAttributes: ctx.context.options.advanced
						?.defaultCookieAttributes
						? {
								sameSite:
									ctx.context.options.advanced?.defaultCookieAttributes
										?.sameSite || null,
								httpOnly:
									typeof ctx.context.options.advanced?.defaultCookieAttributes
										?.httpOnly !== "undefined"
										? ctx.context.options.advanced?.defaultCookieAttributes
												?.httpOnly
										: null,
								prefix:
									ctx.context.options.advanced?.defaultCookieAttributes
										?.prefix || null,
								partitioned:
									typeof ctx.context.options.advanced?.defaultCookieAttributes
										?.partitioned !== "undefined"
										? ctx.context.options.advanced?.defaultCookieAttributes
												?.partitioned
										: null,
								secure:
									typeof ctx.context.options.advanced?.defaultCookieAttributes
										?.secure !== "undefined"
										? ctx.context.options.advanced?.defaultCookieAttributes
												?.secure
										: null,
							}
						: null,
					appName: ctx.context.options.appName || null,
					hasJoinsEnabled: ctx.context.options.experimental?.joins === true,
				},
			};
		},
	);
};
