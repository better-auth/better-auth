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
	assetPrefix: "/docs-assets",
	async redirects() {
		return [
			{
				source: "/docs",
				destination: "/docs/introduction",
				permanent: false,
			},
			{
				source: "/products",
				destination: "/framework",
				permanent: false,
			},
		];
	},
	async rewrites() {
		return {
			beforeFiles: [
				{
					source: "/docs-assets/_next/:path*",
					destination: "/_next/:path*",
				},
			],
		};
	},
};

const withMDX = createMDX({
	contentDirBasePath: "/content/docs",
});
export default withMDX(nextConfig);
