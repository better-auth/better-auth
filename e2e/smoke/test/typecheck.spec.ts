import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));

[
	{ dir: "tsconfig-declaration", skip: false },
	{ dir: "tsconfig-composite-client", skip: false },
	{ dir: "tsconfig-exact-optional-property-types", skip: false },
	{ dir: "tsconfig-verbatim-module-syntax-node10", skip: false },
	{ dir: "tsconfig-isolated-module-bundler", skip: false },
].forEach(({ dir, skip }) => {
	test(`typecheck ${dir}`, { skip }, () => {
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

		if (dir === "tsconfig-declaration") {
			const apiKeyDeclaration = readFileSync(
				resolve(cwd, "dist/api-key.d.ts"),
				"utf8",
			);
			assert.match(
				apiKeyDeclaration,
				/import\("@better-auth\/api-key"\)\.ApiKeyPlugin/,
				"API Key declarations should use the public plugin type",
			);

			const demoDeclaration = readFileSync(
				resolve(cwd, "dist/demo.d.ts"),
				"utf8",
			);
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
				assert.match(
					demoDeclaration,
					new RegExp(`import\\("better-auth/plugins"\\)\\.${pluginType}`),
					`${pluginType} declarations should use the public plugin type`,
				);
			}
			assert.match(
				demoDeclaration,
				/import\("@better-auth\/passkey"\)\.PasskeyPlugin/,
				"Passkey declarations should use the public plugin type",
			);
			assert.match(
				demoDeclaration,
				/import\("@better-auth\/sso"\)\.SSODomainVerificationPlugin/,
				"SSO declarations should use the public plugin type",
			);

			const oauthProviderDeclaration = readFileSync(
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
				assert.match(
					oauthProviderDeclaration,
					new RegExp(
						`import\\("${moduleName.replaceAll("/", "\\/")}\"\\)\\.${pluginType}`,
					),
					`${pluginType} declarations should use the public plugin type`,
				);
			}
		}
	});
});
