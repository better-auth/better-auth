import { createMDX } from "fumadocs-mdx/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
	experimental: {
		optimizePackageImports: [
			"lucide-react",
			"framer-motion",
			"@radix-ui/react-tabs",
			"@radix-ui/react-scroll-area",
			"@radix-ui/react-popover",
			"@radix-ui/react-select",
			"@radix-ui/react-checkbox",
		],
	},
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "**",
			},
			{
				protocol: "http",
				hostname: "**",
			},
		],
	},
	async redirects() {
		return [
			// Infrastructure backwards compatibility redirects
			{
				source: "/dashboard/:path*",
				destination: "https://dash.better-auth.com",
				permanent: true,
			},
			{
				source: "/docs",
				destination: "/docs/introduction",
				permanent: false,
			},
			// Legacy query string based redirects
			{
				source: "/products",
				has: [{ type: "query", key: "tab", value: "framework" }],
				destination: "/products/framework",
				permanent: true,
			},
			{
				source: "/products",
				has: [{ type: "query", key: "tab", value: "infrastructure" }],
				destination: "/products/infrastructure",
				permanent: true,
			},
			{
				source: "/terms",
				destination: "/legal/terms",
				permanent: true,
			},
			{
				source: "/privacy",
				destination: "/legal/privacy",
				permanent: true,
			},
		];
	},
};

const withMDX = createMDX({
	contentDirBasePath: "/content/docs",
});
export default withMDX(nextConfig);
