import { defineConfig } from "tsdown";

export default defineConfig([
	{
		dts: { build: true, incremental: true },
		format: ["esm"],
		entry: [
			"./src/index.ts",
			"./src/client.ts",
			"./src/proxy.ts",
			"./src/storage.ts",
		],
		deps: {
			neverBundle: [
				"better-auth",
				"better-call",
				"@better-fetch/fetch",
				"electron",
			],
		},
		treeshake: true,
	},
	{
		dts: { build: true, incremental: true },
		format: ["esm"],
		entry: ["./src/preload.ts"],
		deps: {
			neverBundle: (id, _, isResolved) => {
				if (isResolved) return false;
				return (
					!id.startsWith(".") &&
					!id.startsWith("better-call") &&
					!id.startsWith("@better-auth/core")
				);
			},
			alwaysBundle: [/^@better-auth\/core/, /^better-call/],
			onlyAllowBundle: ["better-call", "@standard-schema/spec"],
		},
		treeshake: true,
	},
]);
