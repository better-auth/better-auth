import { describe, expect, it } from "vitest";
import {
	categorizeFeatures,
	generatePluginImports,
	generatePluginSetup,
	getPluginEnvVars,
	getSocialProviderEnvVars,
} from "./features";

describe("categorizeFeatures", () => {
	it("should categorize email-password", () => {
		const result = categorizeFeatures(["email-password"]);

		expect(result.hasEmailPassword).toBe(true);
		expect(result.socialProviders).toEqual([]);
		expect(result.plugins).toEqual([]);
	});

	it("should categorize social providers", () => {
		const result = categorizeFeatures(["google", "github", "discord"]);

		expect(result.socialProviders).toEqual(["google", "github", "discord"]);
		expect(result.plugins).toEqual([]);
	});

	it("should categorize plugins", () => {
		const result = categorizeFeatures(["2fa", "organization", "passkey"]);

		expect(result.plugins).toEqual(["2fa", "organization", "passkey"]);
		expect(result.socialProviders).toEqual([]);
	});

	it("should categorize mixed features", () => {
		const result = categorizeFeatures([
			"email-password",
			"google",
			"github",
			"2fa",
			"organization",
		]);

		expect(result.hasEmailPassword).toBe(true);
		expect(result.socialProviders).toEqual(["google", "github"]);
		expect(result.plugins).toEqual(["2fa", "organization"]);
	});

	it("should handle empty features", () => {
		const result = categorizeFeatures([]);

		expect(result.hasEmailPassword).toBe(false);
		expect(result.socialProviders).toEqual([]);
		expect(result.plugins).toEqual([]);
	});
});

describe("getSocialProviderEnvVars", () => {
	it("should return client ID and secret env vars", () => {
		const result = getSocialProviderEnvVars("google");

		expect(result).toHaveLength(2);
		expect(result.some((e) => e.name === "GOOGLE_CLIENT_ID")).toBe(true);
		expect(result.some((e) => e.name === "GOOGLE_CLIENT_SECRET")).toBe(true);
		expect(result.every((e) => e.required === true)).toBe(true);
	});

	it("should uppercase provider name for env vars", () => {
		const result = getSocialProviderEnvVars("github");

		expect(result.some((e) => e.name === "GITHUB_CLIENT_ID")).toBe(true);
		expect(result.some((e) => e.name === "GITHUB_CLIENT_SECRET")).toBe(true);
	});
});

describe("generatePluginImports", () => {
	it("should generate server and client imports for plugins with both", () => {
		const result = generatePluginImports(["2fa"]);

		expect(result.serverImports).toHaveLength(1);
		expect(result.clientImports).toHaveLength(1);
	});

	it("should generate server-only imports for plugins without client", () => {
		const result = generatePluginImports(["bearer"]);

		expect(result.serverImports).toHaveLength(1);
		expect(result.clientImports).toEqual([]);
	});

	it("should generate imports for multiple plugins", () => {
		const result = generatePluginImports(["2fa", "organization", "admin"]);

		expect(result.serverImports).toHaveLength(3);
		expect(result.clientImports).toHaveLength(3);
	});

	it("should return empty arrays for unknown plugins", () => {
		const result = generatePluginImports(["unknown-plugin"]);

		expect(result.serverImports).toEqual([]);
		expect(result.clientImports).toEqual([]);
	});
});

describe("generatePluginSetup", () => {
	it("should generate server and client plugin calls", () => {
		const result = generatePluginSetup(["2fa"]);

		expect(result.serverPlugins).toHaveLength(1);
		expect(result.clientPlugins).toHaveLength(1);
	});

	it("should generate plugins with configuration for magic-link", () => {
		const result = generatePluginSetup(["magic-link"]);

		expect(result.serverPlugins[0]).toContain("sendMagicLink");
	});

	it("should generate plugins with configuration for phone-number", () => {
		const result = generatePluginSetup(["phone-number"]);

		expect(result.serverPlugins[0]).toContain("sendOTP");
	});

	it("should generate plugins with configuration for captcha", () => {
		const result = generatePluginSetup(["captcha"]);

		expect(result.serverPlugins[0]).toContain("provider");
		expect(result.serverPlugins[0]).toContain("secretKey");
	});
});

describe("getPluginEnvVars", () => {
	it("should return env vars for plugins that need them", () => {
		const result = getPluginEnvVars(["captcha"]);

		expect(result.some((e) => e.name === "CAPTCHA_SECRET_KEY")).toBe(true);
	});

	it("should return empty for plugins without env vars", () => {
		const result = getPluginEnvVars(["2fa", "organization"]);

		expect(result).toEqual([]);
	});

	it("should aggregate env vars from multiple plugins", () => {
		const result = getPluginEnvVars(["captcha", "2fa"]);

		expect(result).toHaveLength(1);
	});
});
