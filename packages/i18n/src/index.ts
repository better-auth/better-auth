import type { AuthContext, BetterAuthPlugin } from "@better-auth/core";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { parseCookies } from "better-auth/cookies";
import type { I18nOptions, LocaleDetectionStrategy } from "./types";

export type {
	I18nOptions,
	LocaleDetectionStrategy,
	TranslationDictionary,
} from "./types";

declare module "@better-auth/core" {
	// biome-ignore lint/correctness/noUnusedVariables: Auth and Context need to be same as declared in the module
	interface BetterAuthPluginRegistry<Options> {
		i18n: {
			creator: typeof i18n;
		};
	}
}

/**
 * Parse Accept-Language header and return locales sorted by quality
 */
function parseAcceptLanguage(header: string | null): string[] {
	if (!header) return [];
	return header
		.split(",")
		.map((part) => {
			const [localeStr, quality = "q=1"] = part.trim().split(";");
			const q = Number.parseFloat(quality.replace("q=", ""));
			// Get base locale (e.g., "en" from "en-US")
			const locale = localeStr?.trim().split("-")[0] ?? "";
			return { locale, q };
		})
		.filter((item) => item.locale.length > 0)
		.sort((a, b) => b.q - a.q)
		.map((item) => item.locale);
}

/**
 * i18n plugin for Better Auth
 *
 * Translates error messages based on detected locale.
 *
 * @example
 * ```ts
 * import { betterAuth } from "better-auth";
 * import { i18n } from "@better-auth/i18n";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     i18n({
 *       translations: {
 *         en: { USER_NOT_FOUND: "User not found" },
 *         fr: { USER_NOT_FOUND: "Utilisateur non trouvé" },
 *       },
 *       detection: ["header", "cookie"],
 *     }),
 *   ],
 * });
 * ```
 */
export const i18n = <Locales extends string[]>(
	options: I18nOptions<Locales>,
) => {
	const availableLocales = Object.keys(options.translations);

	let defaultLocale: Locales[number];
	if (
		options.defaultLocale &&
		availableLocales.includes(options.defaultLocale)
	) {
		defaultLocale = options.defaultLocale;
	} else if (availableLocales.includes("en")) {
		defaultLocale = "en" as Locales[number];
	} else if (availableLocales.length > 0) {
		defaultLocale = availableLocales[0] as Locales[number];
	} else {
		throw new Error(
			"i18n plugin: translations object is empty. At least one locale must be provided.",
		);
	}

	const opts = {
		defaultLocale,
		detection: ["header"] as LocaleDetectionStrategy[],
		localeCookie: "locale",
		userLocaleField: "locale",
		...options,
	};

	async function detectLocale(
		request: Request | undefined,
		headers: Headers | undefined,
		ctx: AuthContext,
	): Promise<Locales[number]> {
		for (const strategy of opts.detection) {
			let locale: Locales[number] | null = null;

			switch (strategy) {
				case "header": {
					const acceptLang = headers?.get("Accept-Language") ?? null;
					const preferred = parseAcceptLanguage(acceptLang);
					locale = preferred.find((l) => availableLocales.includes(l)) ?? null;
					break;
				}

				case "cookie": {
					const cookieHeader = headers?.get("Cookie");
					if (cookieHeader) {
						const cookies = parseCookies(cookieHeader);
						const cookieLocale = cookies.get(opts.localeCookie);
						if (cookieLocale && availableLocales.includes(cookieLocale)) {
							locale = cookieLocale;
						}
					}
					break;
				}

				case "session": {
					if (ctx.session?.user) {
						const userLocale = (ctx.session.user as Record<string, unknown>)[
							opts.userLocaleField
						];
						if (
							typeof userLocale === "string" &&
							availableLocales.includes(userLocale)
						) {
							locale = userLocale;
						}
					}
					break;
				}

				case "callback": {
					if (opts.getLocale && request) {
						const callbackLocale = await opts.getLocale(request, ctx);
						if (callbackLocale && availableLocales.includes(callbackLocale)) {
							locale = callbackLocale;
						}
					}
					break;
				}
			}

			if (locale) return locale;
		}

		return opts.defaultLocale;
	}

	return {
		id: "i18n",

		hooks: {
			after: [
				{
					matcher: () => true,
					handler: createAuthMiddleware(async (ctx) => {
						const returned = ctx.context.returned;

						if (!isAPIError(returned)) {
							return;
						}

						const errorCode = (returned.body as Record<string, unknown>)?.code;
						if (typeof errorCode !== "string") {
							return;
						}

						const locale = await detectLocale(
							ctx.request,
							ctx.headers,
							ctx.context,
						);

						const translation = opts.translations[locale]?.[errorCode];

						if (!translation) {
							return;
						}

						throw new APIError(returned.status, {
							code: errorCode,
							message: translation,
							originalMessage: returned.message,
						});
					}),
				},
			],
		},

		options: opts,
	} satisfies BetterAuthPlugin;
};
