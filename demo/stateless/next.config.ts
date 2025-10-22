import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	transpilePackages: ["better-auth", "@better-auth/core"],
};

export default nextConfig;
