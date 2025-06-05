import { describe, expect, it } from "vitest";
import { type SimpleDictWithTFunc, generateDictWithT, localization } from "./index";

function createMockResponse(body: any) {
  return {
    async json() {
      return body;
    },
    status: 200,
    headers: new Headers(),
  } as Response;
}

describe("localization plugin", () => {
  const ctx = { acceptLanguage: "ja", referer: "" };

  it("simpleDict is prioritized over the json dictionary", async () => {
    const plugin = localization({
      enabled_locales: ["en", "ja"],
      simpleDict: { HELLO_WORLD: "hello world", EMAIL_NOT_VERIFIED: "email not verified!!!" },
    } as any);
    const response = createMockResponse({ code: "HELLO_WORLD" });
    const result = await plugin.onResponse(response, ctx);
    const body = JSON.parse(await result.response.text());
    expect(body.message).toBe("hello world");
  });

  it("multiLangDict is prioritized over the json dictionary (ja)", async () => {
    const plugin = localization({
      enabled_locales: ["en", "ja"],
      multiLangDict: {
        HELLO_WORLD: { en: "hello world", ja: "こんにちは" },
        EMAIL_NOT_VERIFIED: { en: "email not verified!!!", ja: "Eメール確認されてません!!!" },
      },
    } as any);
    const response = createMockResponse({ code: "HELLO_WORLD" });
    const ctxJa = { acceptLanguage: "ja", referer: "" };
    const result = await plugin.onResponse(response, ctxJa);
    const body = JSON.parse(await result.response.text());
    expect(body.message).toBe("こんにちは");
  });

  it("multiLangDict is prioritized over the json dictionary (en)", async () => {
    const plugin = localization({
      enabled_locales: ["en", "ja"],
      multiLangDict: {
        HELLO_WORLD: { en: "hello world", ja: "こんにちは" },
        EMAIL_NOT_VERIFIED: { en: "email not verified!!!", ja: "Eメール確認されてません!!!" },
      },
    } as any);
    const response = createMockResponse({ code: "HELLO_WORLD" });
    const ctxEn = { acceptLanguage: "en", referer: "" };
    const result = await plugin.onResponse(response, ctxEn);
    const body = JSON.parse(await result.response.text());
    expect(body.message).toBe("hello world");
  });

  it("simpleDict and json dictionary are merged", async () => {
    const plugin = localization({
      enabled_locales: ["en", "ja"],
      simpleDict: { HELLO_WORLD: "hello world" },
    } as any);
    const response = createMockResponse({ code: "ACCOUNT_NOT_FOUND" });
    const result = await plugin.onResponse(response, ctx);
    const body = JSON.parse(await result.response.text());
    // The value from the ja json dictionary is returned
    expect(body.message).toBe("アカウントが見つかりません");
  });

  it("multiLangDict and json dictionary are merged", async () => {
    const plugin = localization({
      enabled_locales: ["en", "ja"],
      multiLangDict: {
        HELLO_WORLD: { en: "hello world", ja: "こんにちは" },
      },
    } as any);
    const response = createMockResponse({ code: "ACCOUNT_NOT_FOUND" });
    const ctxEn = { acceptLanguage: "en", referer: "" };
    const result = await plugin.onResponse(response, ctxEn);
    const body = JSON.parse(await result.response.text());
    // The value from the en json dictionary is returned
    expect(body.message).toBe("Account not found");
  });
});

describe("generateDictWithT", () => {
  it("should generate dict using tFuncServer and simpleDictWithTFunc", async () => {
    const simpleDictWithTFunc: SimpleDictWithTFunc = (t) => ({ TEST: t("TEST") });
    const tFuncServer = async (locale: string) => (key: string) => `[${locale}]${key}`;
    const dict = await generateDictWithT(simpleDictWithTFunc, tFuncServer, "ja");
    expect(dict).toEqual({ TEST: "[ja]TEST" });
  });
});
