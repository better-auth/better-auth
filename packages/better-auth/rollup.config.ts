import { readFileSync } from "node:fs";
import nodeResolve from "@rollup/plugin-node-resolve";
import { defineConfig } from "rollup";
import { swc } from "rollup-plugin-swc3";

const pkg = JSON.parse(
	readFileSync(new URL("./package.json", import.meta.url), "utf-8")
);

const entry = [
	"./src/index.ts",
	"./src/auth/minimal.ts",
	"./src/social-providers/index.ts",
	"./src/client/index.ts",
	"./src/client/plugins/index.ts",
	"./src/types/index.ts",
	"./src/crypto/index.ts",
	"./src/cookies/index.ts",
	"./src/adapters/prisma-adapter/index.ts",
	"./src/adapters/drizzle-adapter/index.ts",
	"./src/adapters/mongodb-adapter/index.ts",
	"./src/adapters/kysely-adapter/index.ts",
	"./src/adapters/memory-adapter/index.ts",
	"./src/adapters/index.ts",
	"./src/db/index.ts",
	"./src/db/adapter-kysely.ts",
	"./src/db/adapter-base.ts",
	"./src/db/get-migration.ts",
	"./src/oauth2/index.ts",
	"./src/client/react/index.ts",
	"./src/client/vue/index.ts",
	"./src/client/svelte/index.ts",
	"./src/client/solid/index.ts",
	"./src/client/lynx/index.ts",
	"./src/plugins/index.ts",
	"./src/plugins/access/index.ts",
	"./src/api/index.ts",
	"./src/integrations/svelte-kit.ts",
	"./src/integrations/solid-start.ts",
	"./src/integrations/next-js.ts",
	"./src/integrations/tanstack-start.ts",
	"./src/integrations/tanstack-start-solid.ts",
	"./src/integrations/node.ts",
	"./src/plugins/admin/index.ts",
	"./src/plugins/admin/access/index.ts",
	"./src/plugins/anonymous/index.ts",
	"./src/plugins/bearer/index.ts",
	"./src/plugins/captcha/index.ts",
	"./src/plugins/custom-session/index.ts",
	"./src/plugins/device-authorization/index.ts",
	"./src/plugins/email-otp/index.ts",
	"./src/plugins/generic-oauth/index.ts",
	"./src/plugins/jwt/index.ts",
	"./src/plugins/magic-link/index.ts",
	"./src/plugins/multi-session/index.ts",
	"./src/plugins/one-tap/index.ts",
	"./src/plugins/open-api/index.ts",
	"./src/plugins/oidc-provider/index.ts",
	"./src/plugins/oauth-proxy/index.ts",
	"./src/plugins/organization/index.ts",
	"./src/plugins/organization/access/index.ts",
	"./src/plugins/phone-number/index.ts",
	"./src/plugins/two-factor/index.ts",
	"./src/plugins/username/index.ts",
	"./src/plugins/haveibeenpwned/index.ts",
	"./src/plugins/one-time-token/index.ts",
	"./src/plugins/siwe/index.ts",
	"./src/plugins/mcp/client/index.ts",
	"./src/plugins/mcp/client/adapters.ts",
	"./src/test-utils/index.ts",
];

const external = [
	...Object.keys(pkg.dependencies ?? {}),
	...Object.keys(pkg.peerDependencies ?? {}),
];

export default defineConfig({
	input: entry,
	output: {
		dir: "dist",
		format: "esm",
		entryFileNames: "[name].mjs",
		chunkFileNames: "[name]-[hash].mjs",
		preserveModules: true,
		preserveModulesRoot: "src",
		sourcemap: true,
	},
	external(id) {
		if (id.startsWith("node:")) return true;
		return external.some(
			(dep) => id === dep || id.startsWith(`${dep}/`)
		);
	},
	plugins: [
		nodeResolve({ extensions: [".ts", ".mts", ".js", ".mjs"] }),
		swc({
			jsc: {
				target: "esnext",
				externalHelpers: false,
			},
			module: { type: "es6" },
			sourceMaps: true,
		}),
	],
	treeshake: true,
});
