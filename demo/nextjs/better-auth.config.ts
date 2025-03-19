import { defineConfig } from "@better-auth/cli";
export default defineConfig({
	config: {
		path: "/lib/auth.ts",
	},
	tsConfig: {
		path: "../../tsconfig.json",
	},
});
