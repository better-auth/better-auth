import { describe, expect, it } from "vitest";
import { tempPluginsConfig } from "../configs/temp-plugins.config";
import { generateInnerAuthConfigCode } from "./auth-config";
import { getDatabaseCode } from "./database";
import { formatCode } from "./format";

const formatConfigCode = async (code: string) => {
	let formatted = await formatCode(`const config = {${code}}`);
	formatted = formatted.replace("const config = ", "");
	formatted = formatted.slice(1, -3).trim();
	return formatted;
};

const mockInstallDependency = async () => {};

describe("Init CLI - auth config generation", () => {
	/** @see https://partner.steamgames.com/doc/features/auth#website */
	it("keeps Steam profile lookup optional and OAuth credentials required", async () => {
		const config = await generateInnerAuthConfigCode({
			socialProviders: ["steam", "google"],
			installDependency: mockInstallDependency,
		});
		expect(config).toContain("apiKey: process.env.STEAM_API_KEY,");
		expect(config).not.toContain("STEAM_CLIENT_ID");
		expect(config).not.toContain("STEAM_CLIENT_SECRET");
		expect(config).toContain("clientId: process.env.GOOGLE_CLIENT_ID!,");
		expect(config).toContain(
			"clientSecret: process.env.GOOGLE_CLIENT_SECRET!,",
		);
	});
	it("should just generate the database code", async () => {
		const authConfig = await generateInnerAuthConfigCode({
			database: getDatabaseCode("prisma-sqlite"),
			installDependency: mockInstallDependency,
		});
		const formattedAuthConfig = await formatConfigCode(authConfig);
		const expectedCode = `database: prismaAdapter(client, { provider: "sqlite" })`;
		expect(formattedAuthConfig).toEqual(expectedCode);
	});

	it("should generate the database + app-name code", async () => {
		const authConfig = await generateInnerAuthConfigCode({
			database: getDatabaseCode("prisma-sqlite"),
			appName: "My App \test",
			installDependency: mockInstallDependency,
		});
		const formattedAuthConfig = await formatConfigCode(authConfig);
		const expectedCode = await formatConfigCode(
			[
				`database: prismaAdapter(client, { provider: "sqlite" }),`,
				`appName: "My App \\test",`,
			].join("\n"),
		);
		expect(formattedAuthConfig).toEqual(expectedCode);
	});

	it("should generate the database + app-name + base-url code", async () => {
		const authConfig = await generateInnerAuthConfigCode({
			database: getDatabaseCode("prisma-sqlite"),
			appName: "My App \test",
			baseURL: "https://my-app.com",
			installDependency: mockInstallDependency,
		});
		const formattedAuthConfig = await formatConfigCode(authConfig);
		const expectedCode = await formatConfigCode(
			[
				`database: prismaAdapter(client, { provider: "sqlite" }),`,
				`appName: "My App \\test",`,
				`baseURL: "https://my-app.com/",`,
			].join("\n"),
		);
		expect(formattedAuthConfig).toEqual(expectedCode);
	});

	it("should generate the database + app-name + base-url + plugins code", async () => {
		const authConfig = await generateInnerAuthConfigCode({
			database: getDatabaseCode("prisma-sqlite"),
			appName: "My App \test",
			baseURL: "https://my-app.com",
			plugins: [tempPluginsConfig["username"], tempPluginsConfig["twoFactor"]],
			installDependency: mockInstallDependency,
		});
		const formattedAuthConfig = await formatConfigCode(authConfig);
		const expectedCode = await formatConfigCode(
			[
				`database: prismaAdapter(client, { provider: "sqlite" }),`,
				`appName: "My App \\test",`,
				`baseURL: "https://my-app.com/",`,
				`plugins: [username(), twoFactor()],`,
			].join("\n"),
		);
		expect(formattedAuthConfig).toEqual(expectedCode);
	});
});
