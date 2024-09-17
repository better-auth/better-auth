import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	webpack: (config) => {
		config.externals.push("better-sqlite3", "@libsql/client");
		return config;
	},
	/* config options here */
};

export default nextConfig;
