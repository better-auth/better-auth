import { describe, expect, it } from "vitest";
import { getLocalizedMessage } from "./index";
import enDict from "../../locales/en.json";
import jaDict from "../../locales/ja.json";
import frDict from "../../locales/fr.json";
import deDict from "../../locales/de.json";
import zhCNDict from "../../locales/zh-CN.json";
import koDict from "../../locales/ko.json";
import arDict from "../../locales/ar.json";
import hiDict from "../../locales/hi.json";

const dicts: Record<string, Record<string, string>> = {
	en: enDict,
	ja: jaDict,
	fr: frDict,
	de: deDict,
	"zh-CN": zhCNDict,
	ko: koDict,
	ar: arDict,
	hi: hiDict,
};

describe("getLocalizedMessage", () => {
	["en", "ja", "fr", "de", "zh-CN", "ko", "ar", "hi"].forEach((lang) => {
		it(`${lang}: ACCOUNT_NOT_FOUND`, () => {
			expect(getLocalizedMessage(lang, "ACCOUNT_NOT_FOUND")).toBe(
				dicts[lang]["ACCOUNT_NOT_FOUND"],
			);
		});
	});

	["en", "ja"].forEach((lang) => {
		it(`${lang}: NOT_EXISTING_KEY`, () => {
			expect(getLocalizedMessage(lang, "NOT_EXISTING_KEY")).toBeUndefined();
		});
	});

	it("undefined lang defaults to en", () => {
		expect(getLocalizedMessage(undefined, "ACCOUNT_NOT_FOUND")).toBe(
			enDict["ACCOUNT_NOT_FOUND"],
		);
	});
	it("undefined code returns undefined", () => {
		expect(getLocalizedMessage("en", undefined)).toBeUndefined();
	});
});
