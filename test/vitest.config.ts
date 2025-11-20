import path from "path";
import { defineProject } from "vitest/config";

export default defineProject({
	resolve: {
		alias: {
			"better-auth/plugins": path.resolve(
				__dirname,
				"../packages/better-auth/src/plugins/index.ts",
			),
			"better-auth": path.resolve(
				__dirname,
				"../packages/better-auth/src/index.ts",
			),
		},
	},
});
