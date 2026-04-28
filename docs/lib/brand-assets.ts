export const brandAssetPaths = {
	assetsZip: "/branding/better-auth-brand-assets.zip",
	logo: {
		light: {
			svg: "/branding/better-auth-logo-light.svg",
			png: "/branding/better-auth-logo-light.png",
		},
		dark: {
			svg: "/branding/better-auth-logo-dark.svg",
			png: "/branding/better-auth-logo-dark.png",
		},
	},
	wordmark: {
		light: {
			svg: "/branding/better-auth-logo-wordmark-light.svg",
			png: "/branding/better-auth-logo-wordmark-light.png",
		},
		dark: {
			svg: "/branding/better-auth-logo-wordmark-dark.svg",
			png: "/branding/better-auth-logo-wordmark-dark.png",
		},
	},
} as const;

export const brandLogoPreviews = [
	{
		label: "Mark · Light",
		src: brandAssetPaths.logo.light.svg,
		bg: "bg-white",
	},
	{
		label: "Mark · Dark",
		src: brandAssetPaths.logo.dark.svg,
		bg: "bg-black",
	},
	{
		label: "Wordmark · Light",
		src: brandAssetPaths.wordmark.light.svg,
		bg: "bg-white",
	},
	{
		label: "Wordmark · Dark",
		src: brandAssetPaths.wordmark.dark.svg,
		bg: "bg-black",
	},
] as const;
