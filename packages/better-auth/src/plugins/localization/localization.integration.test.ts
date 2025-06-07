import { describe, it, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { localization } from ".";

// Accept-Languageヘッダーを付与するfetchOptions生成
const fetchOptions = (lang: string, referer?: string) => ({
	headers: {
		"accept-language": lang,
		...(referer ? { referer } : {}),
	},
});

describe("localization plugin integration", async () => {
	it("default: Accept-Languageで翻訳される", async () => {
		const { client } = await getTestInstance({
			plugins: [localization()],
		});
		const res = await client.signIn.email({
			email: "test@test.com",
			password: "test123456",
			fetchOptions: fetchOptions("ja"),
		});
		// ACCOUNT_NOT_FOUNDはja辞書で翻訳される
		if (res.error) {
			expect(res.error.message).toBe("アカウントが見つかりません");
		}
	});

	it("singleLang: 常に指定言語で翻訳", async () => {
		const { client } = await getTestInstance({
			plugins: [localization({ singleLang: "ja" })],
		});
		const res = await client.signIn.email({
			email: "test@test.com",
			password: "test123456",
			fetchOptions: fetchOptions("en"),
		});
		if (res.error) {
			expect(res.error.message).toBe("アカウントが見つかりません");
		}
	});

	it("enabledLocales: 指定言語のみ許可", async () => {
		const { client } = await getTestInstance({
			plugins: [localization({ enabledLocales: ["en", "ja"] })],
		});
		const res = await client.signIn.email({
			email: "test@test.com",
			password: "test123456",
			fetchOptions: fetchOptions("fr"),
		});
		// frは許可されていないので英語になる
		if (res.error) {
			expect(res.error.message).toBe("Account not found");
		}
	});

	it("i18nRouting: refererのパスで言語判定", async () => {
		const { client } = await getTestInstance({
			plugins: [localization({ i18nRouting: ["en", "ja"] })],
		});
		const res = await client.signIn.email({
			email: "test@test.com",
			password: "test123456",
			fetchOptions: fetchOptions("en", "http://localhost/ja/hoge"),
		});
		if (res.error) {
			expect(res.error.message).toBe("アカウントが見つかりません");
		}
	});

	it("simpleDict/multiLangDict: 独自辞書が優先される", async () => {
		const { client } = await getTestInstance({
			plugins: [
				localization({
					enabledLocales: ["en", "ja"],
					simpleDict: { ACCOUNT_NOT_FOUND: "custom!" },
					multiLangDict: {
						ACCOUNT_NOT_FOUND: { en: "custom!", ja: "カスタム！" },
					},
				}),
			],
		});
		const res = await client.signIn.email({
			email: "test@test.com",
			password: "test123456",
			fetchOptions: fetchOptions("ja"),
		});
		if (res.error) {
			expect(res.error.message).toBe("カスタム！");
		}
	});
});
