import arDict from "../../locales/ar.json";
import csDict from "../../locales/cs.json";
import deDict from "../../locales/de.json";
import enDict from "../../locales/en.json";
import esDict from "../../locales/es.json";
import frDict from "../../locales/fr.json";
import hiDict from "../../locales/hi.json";
import idDict from "../../locales/id.json";
import itDict from "../../locales/it.json";
import jaDict from "../../locales/ja.json";
import koDict from "../../locales/ko.json";
import nlDict from "../../locales/nl.json";
import plDict from "../../locales/pl.json";
import ptDict from "../../locales/pt.json";
import ruDict from "../../locales/ru.json";
import thDict from "../../locales/th.json";
import trDict from "../../locales/tr.json";
import ukDict from "../../locales/uk.json";
import zhCNDict from "../../locales/zh-CN.json";
import zhTWDict from "../../locales/zh-TW.json";
import type { BetterAuthPlugin } from "better-auth";

// allowed locales
const allowedLocales = [
	"en",
	"ja",
	"fr",
	"de",
	"es",
	"it",
	"nl",
	"pl",
	"pt",
	"ru",
	"th",
	"tr",
	"uk",
	"zh-CN",
	"zh-TW",
	"ko",
	"id",
	"hi",
	"cs",
	"ar",
	"all",
] as const;
const allowedLocalesWithoutAll = allowedLocales.filter((l) => l !== "all");
type Locale = (typeof allowedLocales)[number];

// LocalizationOptions type
export type SimpleDict = Record<string, string>;
export type MultiLangDict = Record<string, Partial<Record<Locale, string>>>;
export type TFunc = (locale: string) => Promise<(key: string) => string>;
export type SimpleDictWithTFunc = (
	t: (key: string) => string,
) => Record<string, string>;

// 型定義: simpleDictWithTFuncとtFuncServerは必ずセット
export type LocalizationOptionsExt =
	| ({
			enabledLocales: Locale[];
			i18nRouting?: never;
			singleLang?: never;
	  } & LocalizationOptionsCommon)
	| ({
			enabledLocales?: never;
			i18nRouting: Locale[];
			singleLang?: never;
	  } & LocalizationOptionsCommon)
	| ({
			enabledLocales?: never;
			i18nRouting?: never;
			singleLang: Exclude<Locale, "all">;
	  } & LocalizationOptionsCommon)
	| ({
			enabledLocales?: never;
			i18nRouting?: never;
			singleLang?: never;
	  } & LocalizationOptionsCommon);

// 共通部分
export type LocalizationOptionsCommon = {
	simpleDict?: SimpleDict;
	multiLangDict?: MultiLangDict;
} & (
	| {
			simpleDictWithTFunc: SimpleDictWithTFunc;
			tFuncServer: (locale: string) => Promise<(key: string) => string>;
	  }
	| { simpleDictWithTFunc?: undefined; tFuncServer?: undefined }
);

// Function to determine language
/**
 * getLang(ctx, options)
 * Determines the language to use based on the request context and localization options.
 * @param ctx - The request context (should have acceptLanguage and referer properties)
 * @param options - Localization options (enabledLocales, i18nRouting, or singleLang)
 * @returns {Locale | undefined} - The detected locale or undefined if not found
 *
 * Usage:
 *   const lang = getLang(ctx, options);
 */
export function getLang(
	ctx: any,
	options?: LocalizationOptionsExt,
): Locale | undefined {
	const acceptLang = ctx.acceptLanguage;
	const raw = acceptLang?.split(",")[0]?.trim().split(";")[0];
	let firstLang: string | undefined;
	if (raw === "zh-CN" || raw === "zh-TW") {
		firstLang = raw;
	} else {
		firstLang = raw?.split("-")[0];
	}

	if (
		options?.enabledLocales?.includes("all") ||
		!(options?.enabledLocales || options?.i18nRouting || options?.singleLang)
	) {
		if (
			firstLang &&
			allowedLocalesWithoutAll.includes(
				firstLang as (typeof allowedLocalesWithoutAll)[number],
			)
		) {
			return firstLang as Locale;
		}
	} else if (options?.enabledLocales) {
		if (firstLang && options.enabledLocales.includes(firstLang as Locale)) {
			return firstLang as Locale;
		}
	} else if (options?.i18nRouting) {
		const url = ctx?.referer || "";
		const path = url.replace(/^http?:\/\/[^/]+/, "");
		const firstPath = path.split("/").filter(Boolean)[0];
		if (firstPath && options.i18nRouting.includes(firstPath as Locale)) {
			return firstPath as Locale;
		}
	} else if (options?.singleLang) {
		return options.singleLang;
	}
	return undefined;
}

// Dictionary mapping language code to dictionary
const localeDicts: Record<string, Record<string, string>> = {
	en: enDict,
	ja: jaDict,
	fr: frDict,
	de: deDict,
	es: esDict,
	it: itDict,
	nl: nlDict,
	pl: plDict,
	pt: ptDict,
	ru: ruDict,
	th: thDict,
	tr: trDict,
	uk: ukDict,
	"zh-CN": zhCNDict,
	"zh-TW": zhTWDict,
	ko: koDict,
	id: idDict,
	hi: hiDict,
	cs: csDict,
	ar: arDict,
};

// Function to return localized message from lang and code
/**
 * getLocalizedMessage(lang, code)
 * Returns the localized message string for the given language and code.
 * @param lang - The language code (e.g., 'en', 'ja')
 * @param code - The message code/key
 * @returns {string | undefined} - The localized message or undefined if not found
 *
 * Usage:
 *   const message = getLocalizedMessage('en', 'LOGIN_SUCCESS');
 */
export function getLocalizedMessage(
	lang: string | undefined,
	code: string | undefined,
): string | undefined {
	const dict: Record<string, string> =
		lang && Object.prototype.hasOwnProperty.call(localeDicts, lang)
			? (localeDicts[lang] as Record<string, string>)
			: enDict;
	if (!code) return undefined;
	return dict[code];
}

// tFuncServerとsimpleDictWithTFuncの組み合わせで辞書を生成する関数
export async function generateDictWithT(
	simpleDictWithTFunc: SimpleDictWithTFunc,
	tFuncServer: (locale: string) => Promise<(key: string) => string>,
	locale: string,
): Promise<Record<string, string>> {
	const t = await tFuncServer(locale);
	return simpleDictWithTFunc(t);
}

// Main localization function
/**
 * localization(options)
 * Returns a BetterAuthPlugin for localization, handling request and response localization.
 *
 * @param {Object} options - Localization options object (optional)
 * @param {Record<string, string>} [options.simpleDict] - Key-value pairs to merge into all languages.
 * @param {Record<string, Partial<Record<Locale, string>>>} [options.multiLangDict] - Per-language
 *   message dictionary for each code.
 * @param {Locale[]} [options.enabledLocales] - Array of allowed locales. "all" allows all supported locales.
 * @param {Locale[]} [options.i18nRouting] - Locales to detect from the first path segment of the referer URL.
 * @param {Exclude<Locale, "all">} [options.singleLang] - Always use this language for localization.
 *
 * @returns {BetterAuthPlugin} - The localization plugin object with onRequest and onResponse hooks.
 *
 * Usage:
 *   // Example 1: No arguments (default behavior)
 *   const plugin = localization();
 *   // Uses Accept-Language header to determine the language and translate.
 *
 *   // Example 2: singleLang
 *   const plugin = localization({
 *     singleLang: "ja"
 *   });
 *   // Always uses Japanese for localization, regardless of request headers or URL.
 *
 *   // Example 3: enabledLocales and multiLangDict (multiple languages)
 *   const plugin = localization({
 *     enabledLocales: ["en", "ja", "fr"],
 *     simpleDict: { LOGIN_SUCCESS: "Login successful!" },
 *     multiLangDict: {
 *       LOGIN_SUCCESS: {
 *         en: "Login successful!",
 *         ja: "ログイン成功！",
 *         fr: "Connexion réussie !"
 *       }
 *     }
 *   });
 *   // The message will be translated based on Accept-Language header but limited to the enabledLocales.
 *   // simpleDict and multiLangDict are used with priority over default translations.
 *
 *   // Example 4: i18nRouting
 *   const plugin = localization({
 *     i18nRouting: ["en", "ja"],
 *     simpleDict: {
 *       LOGIN_SUCCESS: "Login successful!"
 *     }
 *   });
 *   // The language is determined from the first path segment of the referer URL.
 *
 *   // Example 5: simpleDictWithTFunc and tFuncServer (for dynamic translation)
 *   const plugin = localization({
 *     i18nRouting: ["en", "ja"],
 *     simpleDictWithTFunc: (t) => ({ EMAIL_NOT_VERIFIED: t("Email not verified!!") }),
 *     tFuncServer: async (locale) => {
 *       const t = await getTranslations({ locale });
 *       return (key) => t(key);
 *     },
 *   });
 *   // Used for i18n routing such as next-intl.
 *   // The message will be dynamically translated using the t function for the current locale.
 *
 *   // Use plugin.onRequest and plugin.onResponse in your auth flow
 */
export const localization = (options?: LocalizationOptionsExt) => {
	// Generate merged dictionary from simpleDict and multiLangDict
	const mergedDicts: Record<string, Record<string, string>> = {
		...localeDicts,
	};
	if (options?.simpleDict) {
		for (const lang of Object.keys(mergedDicts)) {
			mergedDicts[lang] = { ...mergedDicts[lang], ...options.simpleDict };
		}
	}
	if (options?.multiLangDict) {
		for (const code of Object.keys(options.multiLangDict)) {
			const langMap = options.multiLangDict[code];
			if (langMap) {
				for (const lang of Object.keys(langMap) as Locale[]) {
					const val = langMap[lang];
					if (val && mergedDicts[lang]) {
						mergedDicts[lang][code] = val;
					}
				}
			}
		}
	}
	// 型定義で担保されているため、ここでのランタイムチェックは不要
	return {
		id: "localization",
		async onRequest(req: Request, ctx: any) {
			ctx.acceptLanguage = req.headers.get("accept-language");
			ctx.referer = req.headers.get("referer");
		},
		onResponse: async (response: Response, ctx: any) => {
			const body = await response.json();
			const lang = getLang(ctx, options);
			let t: ((key: string) => string) | undefined = undefined;
			let dictWithT: Record<string, string> | undefined = undefined;
			if (options?.simpleDictWithTFunc && options?.tFuncServer) {
				t = await options.tFuncServer(lang || "en");
				dictWithT = options.simpleDictWithTFunc(t);
			}
			if (body?.code) {
				// 優先度: simpleDictWithTFunc > multiLangDict/simpleDict > localeDicts
				if (dictWithT && dictWithT[body.code] !== undefined) {
					body.message = dictWithT[body.code];
				} else {
					// multiLangDict/simpleDict/localeDicts
					const dict =
						lang && mergedDicts[lang] ? mergedDicts[lang] : mergedDicts.en;
					if (dict && dict[body.code] !== undefined) {
						body.message = dict[body.code];
					}
				}
			}
			return {
				response: new Response(JSON.stringify(body), {
					status: response.status,
					headers: response.headers,
				}),
			};
		},
	} satisfies BetterAuthPlugin;
};
