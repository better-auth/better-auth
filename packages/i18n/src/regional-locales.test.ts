import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { i18n } from ".";

/**
 * @see https://github.com/better-auth/better-auth/issues/11659
 */
describe("regional locales in Accept-Language", async () => {
	const { auth } = await getTestInstance({
		plugins: [
			i18n({
				translations: {
					en: { INVALID_EMAIL_OR_PASSWORD: "English" },
					zh: { INVALID_EMAIL_OR_PASSWORD: "Simplified Chinese" },
					"zh-TW": { INVALID_EMAIL_OR_PASSWORD: "Traditional Chinese" },
					"zh-HK": { INVALID_EMAIL_OR_PASSWORD: "Hong Kong Chinese" },
					"zh-Hant-HK": { INVALID_EMAIL_OR_PASSWORD: "Script and region" },
					pt: { INVALID_EMAIL_OR_PASSWORD: "Portuguese" },
					"pt-BR": { INVALID_EMAIL_OR_PASSWORD: "Brazilian Portuguese" },
					fr: { INVALID_EMAIL_OR_PASSWORD: "French" },
				},
				defaultLocale: "en",
			}),
		],
	});

	it.each([
		["zh-TW,zh;q=0.9", "Traditional Chinese"],
		["zh-HK", "Hong Kong Chinese"],
		["zh-Hant-HK", "Script and region"],
		["pt-BR", "Brazilian Portuguese"],
		["pt-PT", "Portuguese"],
		["fr-CA", "French"],
		["zh", "Simplified Chinese"],
		["zh-TW;q=0.8,fr;q=0.9", "French"],
		["fr;q=0.7,zh-TW;q=0.9", "Traditional Chinese"],
		["zh-MO,fr;q=0.9", "Simplified Chinese"],
		["de-DE", "English"],
		["", "English"],
	])("selects the configured translation for %s", async (header, message) => {
		const response = await auth.api.signInEmail({
			body: { email: "missing@example.com", password: "wrong-password" },
			headers: { "Accept-Language": header },
			asResponse: true,
		});
		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({
			code: "INVALID_EMAIL_OR_PASSWORD",
			message,
			originalMessage: "Invalid email or password",
		});
	});

	it("matches a regional translation without a base-language dictionary", async () => {
		const { auth: regionalAuth } = await getTestInstance({
			plugins: [
				i18n({
					translations: {
						"zh-TW": { INVALID_EMAIL_OR_PASSWORD: "Traditional Chinese" },
					},
				}),
			],
		});
		const response = await regionalAuth.api.signInEmail({
			body: { email: "missing@example.com", password: "wrong-password" },
			headers: { "Accept-Language": "zh-TW" },
			asResponse: true,
		});
		expect(await response.json()).toMatchObject({
			code: "INVALID_EMAIL_OR_PASSWORD",
			message: "Traditional Chinese",
		});
	});
});
