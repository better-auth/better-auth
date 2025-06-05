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
  it("enabled_locales: en, ja, Accept-Language: ja", () => {
    const ctx = mockCtx("ja");
    const options = { enabled_locales: ["en", "ja"] as ("en" | "ja" | "all")[] };
    expect(getLang(ctx, options)).toBe("ja");
  });

  it("enabled_locales: all, Accept-Language: en", () => {
    const ctx = mockCtx("en");
    const options = { enabled_locales: ["all"] as ("en" | "ja" | "all")[] };
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

  it("single_lang: en", () => {
    const ctx = mockCtx();
    const options = { single_lang: "en" as "en" | "ja" };
    expect(getLang(ctx, options)).toBe("en");
  });

  it("Accept-Language: de, allowedLocales: en, ja", () => {
    const ctx = mockCtx("de");
    const options = { enabled_locales: ["en", "ja"] as ("en" | "ja" | "all")[] };
    expect(getLang(ctx, options)).toBeUndefined();
  });

  it("enabled_locales: fr, Accept-Language: fr", () => {
    const ctx = mockCtx("fr");
    const options = { enabled_locales: ["fr"] as Locale[] };
    expect(getLang(ctx, options)).toBe("fr");
  });

  it("enabled_locales: zh-CN, Accept-Language: zh-CN", () => {
    const ctx = mockCtx("zh-CN");
    const options = { enabled_locales: ["zh-CN"] as Locale[] };
    expect(getLang(ctx, options)).toBe("zh-CN");
  });

  it("enabled_locales: ko, Accept-Language: ko", () => {
    const ctx = mockCtx("ko");
    const options = { enabled_locales: ["ko"] as Locale[] };
    expect(getLang(ctx, options)).toBe("ko");
  });

  it("enabled_locales: zh-TW, Accept-Language: zh-TW,zh;q=0.9,en;q=0.8", () => {
    const ctx = mockCtx("zh-TW,zh;q=0.9,en;q=0.8");
    const options = { enabled_locales: ["zh-TW"] as Locale[] };
    expect(getLang(ctx, options)).toBe("zh-TW");
  });

  it("enabled_locales: zh-CN, Accept-Language: zh-CN;q=0.9,zh;q=0.8,en-US;q=0.7,en;q=0.6,zh-TW;q=0.5", () => {
    const ctx = mockCtx("zh-CN;q=0.9,zh;q=0.8,en-US;q=0.7,en;q=0.6,zh-TW;q=0.5");
    const options = { enabled_locales: ["zh-CN", "zh-TW"] as Locale[] };
    expect(getLang(ctx, options)).toBe("zh-CN");
  });
});
