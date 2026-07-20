import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMDX } from "fumadocs-mdx/next";

const docsRoot = path.dirname(fileURLToPath(import.meta.url));
// pnpm hoists `next` to the workspace root; Turbopack must include that path.
const workspaceRoot = path.resolve(docsRoot, "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
	// Parent lockfiles (e.g. ~/package-lock.json) make Next infer the wrong
	// Turbopack root and fail to resolve `next` / serve stale CSS.
	turbopack: {
		root: workspaceRoot,
	},
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
			{
				source: "/docs/agent-tools/ask-ai",
				destination: "/docs/ai-resources",
				permanent: true,
			},
			{
				source: "/docs/agent-tools/llms-txt",
				destination: "/llms.txt",
				permanent: true,
			},
			{
				source: "/docs/agent-tools/:path*",
				destination: "/docs/ai-resources/:path*",
				permanent: true,
			},
		];
	},
};

const withMDX = createMDX({
	contentDirBasePath: "/content/docs",
});
export default withMDX(nextConfig);
