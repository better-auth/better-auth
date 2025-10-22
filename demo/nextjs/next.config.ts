import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	typescript: {
		ignoreBuildErrors: true,
	},
	serverExternalPackages: ["@libsql/client", "libsql", "better-sqlite3"],
};

export default nextConfig;
