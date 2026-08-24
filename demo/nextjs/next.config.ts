import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	typescript: {
		ignoreBuildErrors: true,
	},
	serverExternalPackages: ["libsql"],
};

export default nextConfig;
