/**
 * Built-in default translations for the i18n plugin.
 *
 * Each locale exports a {@link TranslationDictionary} covering the core
 * Better Auth error codes. Additional locales can be added by following the
 * same pattern.
 *
 * @example Basic usage — enable all built-in locales
 * ```ts
 * import { i18n, locales } from "@better-auth/i18n";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     i18n({ translations: locales }),
 *   ],
 * });
 * ```
 *
 * @example Selective usage — only a subset of locales
 * ```ts
 * import { i18n, locales } from "@better-auth/i18n";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     i18n({
 *       translations: {
 *         en: locales.en,
 *         fr: locales.fr,
 *       },
 *     }),
 *   ],
 * });
 * ```
 *
 * @example Override specific messages for a locale
 * ```ts
 * import { i18n, locales } from "@better-auth/i18n";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     i18n({
 *       translations: {
 *         ...locales,
 *         fr: {
 *           ...locales.fr,
 *           USER_NOT_FOUND: "Membre introuvable",
 *         },
 *       },
 *     }),
 *   ],
 * });
 * ```
 */

export { ar } from "./ar";
export { bn } from "./bn";
export { de } from "./de";
export { en } from "./en";
export { es } from "./es";
export { fa } from "./fa";
export { fr } from "./fr";
export { hi } from "./hi";
export { id } from "./id";
export { it } from "./it";
export { ja } from "./ja";
export { ko } from "./ko";
export { nl } from "./nl";
export { pl } from "./pl";
export { pt } from "./pt";
export { ru } from "./ru";
export { sv } from "./sv";
export { th } from "./th";
export { tr } from "./tr";
export { uk } from "./uk";
export { vi } from "./vi";
export { zh } from "./zh";
