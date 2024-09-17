import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	webpack: (config) => {
		config.externals.push("@libsql/client", "better-sqlite3");
		return config;
	},
	/* config options here */
};

export default nextConfig;
