import { describe, expect, it } from "vitest";
import { getLocalizedMessage } from "./index";

describe("getLocalizedMessage", () => {
  it("en: ACCOUNT_NOT_FOUND", () => {
    expect(getLocalizedMessage("en", "ACCOUNT_NOT_FOUND")).toBe("Account not found");
  });
  it("ja: ACCOUNT_NOT_FOUND", () => {
    expect(getLocalizedMessage("ja", "ACCOUNT_NOT_FOUND")).toBe("アカウントが見つかりません");
  });
  it("fr: ACCOUNT_NOT_FOUND", () => {
    expect(getLocalizedMessage("fr", "ACCOUNT_NOT_FOUND")).toBe("Compte non trouvé");
  });
  it("de: ACCOUNT_NOT_FOUND", () => {
    expect(getLocalizedMessage("de", "ACCOUNT_NOT_FOUND")).toBe("Konto nicht gefunden");
  });
  it("zh-CN: ACCOUNT_NOT_FOUND", () => {
    expect(getLocalizedMessage("zh-CN", "ACCOUNT_NOT_FOUND")).toBe("未找到帐户");
  });
  it("ko: ACCOUNT_NOT_FOUND", () => {
    expect(getLocalizedMessage("ko", "ACCOUNT_NOT_FOUND")).toBe("계정을 찾을 수 없습니다");
  });
  it("ar: ACCOUNT_NOT_FOUND", () => {
    expect(getLocalizedMessage("ar", "ACCOUNT_NOT_FOUND")).toBe("لم يتم العثور على الحساب");
  });
  it("hi: ACCOUNT_NOT_FOUND", () => {
    expect(getLocalizedMessage("hi", "ACCOUNT_NOT_FOUND")).toBe("खाता नहीं मिला");
  });
  it("en: NOT_EXISTING_KEY", () => {
    expect(getLocalizedMessage("en", "NOT_EXISTING_KEY")).toBeUndefined();
  });
  it("ja: NOT_EXISTING_KEY", () => {
    expect(getLocalizedMessage("ja", "NOT_EXISTING_KEY")).toBeUndefined();
  });
  it("undefined lang defaults to en", () => {
    expect(getLocalizedMessage(undefined, "ACCOUNT_NOT_FOUND")).toBe("Account not found");
  });
  it("undefined code returns undefined", () => {
    expect(getLocalizedMessage("en", undefined)).toBeUndefined();
  });
});
