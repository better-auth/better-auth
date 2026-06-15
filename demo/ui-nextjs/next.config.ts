import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
	transpilePackages: [
		"better-auth",
		"@better-auth/core",
		"@better-auth/memory-adapter",
		"@better-auth/passkey",
		"@better-auth/ui",
	],
	turbopack: {
		root,
	},
};

export default nextConfig;
