import { NextConfig } from "next";

const nextConfig = {
	webpack: (config) => {
		config.externals.push("argon2");
		return config;
	},
} satisfies NextConfig;

export default nextConfig;
