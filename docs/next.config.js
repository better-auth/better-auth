import { join } from "node:path";
import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
	...(process.env.NODE_ENV === "development"
		? {
				turbopack: {
					root: join(import.meta.dirname, ".."),
				},
			}
		: {}),
	async rewrites() {
		return [
			{
				source: "/docs/:path*.mdx",
				destination: "/llms.txt/:path*",
			},
		];
	},
	redirects: async () => {
		return [
			{
				source: "/docs",
				destination: "/docs/introduction",
				permanent: true,
			},
			{
				source: "/docs/examples",
				destination: "/docs/examples/next-js",
				permanent: true,
			},
			// Legacy errors page
			{
				source: "/docs/errors",
				destination: "/docs/reference/errors",
				permanent: true,
			},
			{
				source: "/docs/errors/:path*",
				destination: "/docs/reference/errors/:path*",
				permanent: true,
			},
		];
	},
	serverExternalPackages: [
		"ts-morph",
		"typescript",
		"oxc-transform",
		"@shikijs/twoslash",
	],
	images: {
		remotePatterns: [
			{
				hostname: "images.unsplash.com",
			},
			{
				hostname: "assets.aceternity.com",
			},
			{
				hostname: "pbs.twimg.com",
			},
			{
				hostname: "github.com",
			},
			{
				hostname: "hebbkx1anhila5yf.public.blob.vercel-storage.com",
			},
		],
	},
	reactStrictMode: true,
	typescript: {
		ignoreBuildErrors: true,
	},
	experimental: {
		turbopackFileSystemCacheForDev: true,
	},
};

export default withMDX(config);
