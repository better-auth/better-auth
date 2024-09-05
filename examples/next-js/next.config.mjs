/** @type {import('next').NextConfig} */
const nextConfig = {
	webpack: (config) => {
		config.externals.push("@node-rs/argon2", "@node-rs/bcrypt", "better-sqlite3");

		return config;
	},
	experimental: {
		serverComponentsExternalPackages: ["better-sqlite3"]
	}
};

export default nextConfig;
