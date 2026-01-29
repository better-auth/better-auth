import type {
	AuthContext,
	BetterAuthPluginRegistry,
	BetterAuthPluginRegistryIdentifier,
	UnionToIntersection,
} from "@better-auth/core";

type ALL_PLUGIN_ERROR_CODE_KEYS = keyof UnionToIntersection<
	{
		[Key in Exclude<
			BetterAuthPluginRegistryIdentifier,
			"i18n"
		>]: BetterAuthPluginRegistry<unknown, unknown>[Key] extends {
			creator: infer C;
		}
			? C extends (...args: any[]) => infer P
				? P extends {
						$ERROR_CODES: infer E;
					}
					? E
					: {}
				: {}
			: {};
	}[Exclude<BetterAuthPluginRegistryIdentifier, "i18n">]
>;

type InternalTranslationDictionary = Partial<{
	[Key in ALL_PLUGIN_ERROR_CODE_KEYS]: string;
}>;

/**
 * Translation dictionary mapping error codes to translated messages
 */
export type TranslationDictionary = InternalTranslationDictionary &
	Record<string, string>;

/**
 * Locale detection strategy
 */
export type LocaleDetectionStrategy =
	| "header"
	| "cookie"
	| "session"
	| "callback";

/**
 * Options for the i18n plugin
 */
export interface I18nOptions<Locales extends string[]> {
	/**
	 * Translation dictionaries keyed by locale code
	 * @example
	 * {
	 *   en: { USER_NOT_FOUND: "User not found" },
	 *   fr: { USER_NOT_FOUND: "Utilisateur non trouvé" }
	 * }
	 */
	translations: {
		[Locale in Locales[number]]: TranslationDictionary;
	};

	/**
	 * Default/fallback locale when detection fails
	 * @default "en"
	 */
	defaultLocale?: Locales[number] | undefined;

	/**
	 * Locale detection strategies in priority order
	 * @default ["header"]
	 */
	detection?: LocaleDetectionStrategy[] | undefined;

	/**
	 * Cookie name for locale detection (when "cookie" strategy is used)
	 * @default "locale"
	 */
	localeCookie?: string | undefined;

	/**
	 * User field name for stored locale preference (when "session" strategy is used)
	 * @default "locale"
	 */
	userLocaleField?: string | undefined;

	/**
	 * Custom locale detection function (when "callback" strategy is used)
	 * Receives request and AuthContext, return locale code or null
	 */
	getLocale?:
		| undefined
		| ((
				request: Request,
				ctx: AuthContext,
		  ) => Promise<Locales[number] | null> | Locales[number] | null);
}
