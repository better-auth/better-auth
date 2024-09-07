/** @type {import("next").NextConfig} */
const nextConfig = {
	webpack: (config) => {
		config.externals.push("argon2");
		return config;
	},
}

export default nextConfig;
