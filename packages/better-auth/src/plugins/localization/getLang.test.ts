import { describe, expect, it } from "vitest";
import { getLang } from "./index";

const mockCtx = (acceptLanguage?: string, referer?: string) => ({
	acceptLanguage,
	referer,
});

type Locale =
	| "en"
	| "ja"
	| "fr"
	| "de"
	| "es"
	| "it"
	| "nl"
	| "pl"
	| "pt"
	| "ru"
	| "th"
	| "tr"
	| "uk"
	| "zh-CN"
	| "zh-TW"
	| "ko"
	| "id"
	| "hi"
	| "cs"
	| "ar"
	| "all";

describe("getLang", () => {
	it("enabledLocales: en, ja, Accept-Language: ja", () => {
		const ctx = mockCtx("ja");
		const options = {
			enabledLocales: ["en", "ja"] as ("en" | "ja" | "all")[],
		};
		expect(getLang(ctx, options)).toBe("ja");
	});

	it("enabledLocales: all, Accept-Language: en", () => {
		const ctx = mockCtx("en");
		const options = { enabledLocales: ["all"] as ("en" | "ja" | "all")[] };
		expect(getLang(ctx, options)).toBe("en");
	});

	it("no options, Accept-Language: ja", () => {
		const ctx = mockCtx("ja");
		expect(getLang(ctx, undefined)).toBe("ja");
	});

	it('i18nRouting: ["en", "ja"], url: /ja/hoge', () => {
		const ctx = mockCtx(undefined, "http://localhost/ja/hoge");
		const options = { i18nRouting: ["en", "ja"] as ("en" | "ja" | "all")[] };
		expect(getLang(ctx, options)).toBe("ja");
	});

	it("singleLang: en", () => {
		const ctx = mockCtx();
		const options = { singleLang: "en" as "en" | "ja" };
		expect(getLang(ctx, options)).toBe("en");
	});

	it("Accept-Language: de, allowedLocales: en, ja", () => {
		const ctx = mockCtx("de");
		const options = {
			enabledLocales: ["en", "ja"] as ("en" | "ja" | "all")[],
		};
		expect(getLang(ctx, options)).toBeUndefined();
	});

	it("enabledLocales: fr, Accept-Language: fr", () => {
		const ctx = mockCtx("fr");
		const options = { enabledLocales: ["fr"] as Locale[] };
		expect(getLang(ctx, options)).toBe("fr");
	});

	it("enabledLocales: zh-CN, Accept-Language: zh-CN", () => {
		const ctx = mockCtx("zh-CN");
		const options = { enabledLocales: ["zh-CN"] as Locale[] };
		expect(getLang(ctx, options)).toBe("zh-CN");
	});

	it("enabledLocales: ko, Accept-Language: ko", () => {
		const ctx = mockCtx("ko");
		const options = { enabledLocales: ["ko"] as Locale[] };
		expect(getLang(ctx, options)).toBe("ko");
	});

	it("enabledLocales: zh-TW, Accept-Language: zh-TW,zh;q=0.9,en;q=0.8", () => {
		const ctx = mockCtx("zh-TW,zh;q=0.9,en;q=0.8");
		const options = { enabledLocales: ["zh-TW"] as Locale[] };
		expect(getLang(ctx, options)).toBe("zh-TW");
	});

	it("enabledLocales: zh-CN, Accept-Language: zh-CN;q=0.9,zh;q=0.8,en-US;q=0.7,en;q=0.6,zh-TW;q=0.5", () => {
		const ctx = mockCtx(
			"zh-CN;q=0.9,zh;q=0.8,en-US;q=0.7,en;q=0.6,zh-TW;q=0.5",
		);
		const options = { enabledLocales: ["zh-CN", "zh-TW"] as Locale[] };
		expect(getLang(ctx, options)).toBe("zh-CN");
	});
});
