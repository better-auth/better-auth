import { createMDX } from "fumadocs-mdx/next";

export const withMDX = createMDX();

export default withMDX({
	reactStrictMode: true,
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
});
