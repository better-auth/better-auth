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

describe("Init CLI - auth config generation", () => {
	it("should just generate the database code", async () => {
		const authConfig = await generateInnerAuthConfigCode({
			database: getDatabaseCode("prisma-sqlite"),
			getArguments: async () => undefined,
		});
		const formattedAuthConfig = await formatConfigCode(authConfig);
		const expectedCode = `database: prismaAdapter(client, { provider: "sqlite" })`;
		expect(formattedAuthConfig).toEqual(expectedCode);
	});

	it("should generate the database + app-name code", async () => {
		const authConfig = await generateInnerAuthConfigCode({
			database: getDatabaseCode("prisma-sqlite"),
			appName: "My App \test",
			getArguments: async () => undefined,
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
			getArguments: async () => undefined,
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
			getArguments: async () => undefined,
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
