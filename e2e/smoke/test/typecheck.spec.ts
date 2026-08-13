import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));

function runTypecheckFixture(dir: string) {
	const cwd = resolve(fixturesDir, dir);
	const output = spawnSync("pnpm", ["run", "typecheck"], {
		stdio: "inherit",
		cwd,
		timeout: 10 * 1000, // 10 seconds
	});
	assert.equal(
		output.error,
		undefined,
		`Running typecheck in ${cwd} should not throw an error`,
	);
	assert.equal(
		output.status,
		0,
		`Running typecheck in ${cwd} should exit with status 0`,
	);
	return cwd;
}

function assertPublicPluginType(
	declaration: string,
	moduleName: string,
	pluginType: string,
) {
	assert.ok(
		declaration.includes(`import("${moduleName}").${pluginType}`),
		`${pluginType} declarations should use the public plugin type`,
	);
}

for (const dir of [
	"tsconfig-composite-client",
	"tsconfig-exact-optional-property-types",
	"tsconfig-verbatim-module-syntax-node10",
	"tsconfig-isolated-module-bundler",
]) {
	test(`typecheck ${dir}`, () => {
		runTypecheckFixture(dir);
	});
}

test("emits portable public plugin types in declarations", () => {
	const cwd = runTypecheckFixture("tsconfig-declaration");
	const apiKeyDeclaration = readFileSync(
		resolve(cwd, "dist/api-key.d.ts"),
		"utf8",
	);
	assertPublicPluginType(
		apiKeyDeclaration,
		"@better-auth/api-key",
		"ApiKeyPlugin",
	);

	const demoDeclaration = readFileSync(resolve(cwd, "dist/demo.d.ts"), "utf8");
	const publicPluginTypes = [
		"AdminPlugin",
		"CustomSessionPlugin",
		"DeviceAuthorizationPlugin",
		"EmailOTPPlugin",
		"GenericOAuthPlugin",
		"JwtPlugin",
		"MagicLinkPlugin",
		"MCPPlugin",
		"MultiSessionPlugin",
		"OAuthPopupPlugin",
		"OAuthProxyPlugin",
		"OIDCProviderPlugin",
		"OneTapPlugin",
		"OneTimeTokenPlugin",
		"PhoneNumberPlugin",
		"SIWEPlugin",
		"TwoFactorPlugin",
		"UsernamePlugin",
	];
	for (const pluginType of publicPluginTypes) {
		assertPublicPluginType(demoDeclaration, "better-auth/plugins", pluginType);
	}
	assertPublicPluginType(
		demoDeclaration,
		"@better-auth/passkey",
		"PasskeyPlugin",
	);
	assertPublicPluginType(
		demoDeclaration,
		"@better-auth/sso",
		"SSODomainVerificationPlugin",
	);

	const indexDeclaration = readFileSync(
		resolve(cwd, "dist/index.d.ts"),
		"utf8",
	);
	const externalPluginTypes = [
		["@better-auth/electron", "ElectronPlugin"],
		["@better-auth/expo", "ExpoPlugin"],
		["@better-auth/i18n", "I18nPlugin"],
		["@better-auth/oauth-provider", "OAuthProviderPlugin"],
		[
			"@better-auth/oauth-provider/resource-client",
			"OAuthProviderResourceClientPlugin",
		],
		["@better-auth/scim", "SCIMPlugin"],
	] as const;
	for (const [moduleName, pluginType] of externalPluginTypes) {
		assertPublicPluginType(indexDeclaration, moduleName, pluginType);
	}
});
