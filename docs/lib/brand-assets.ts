export const brandAssetPaths = {
	assetsZip: "/branding/better-auth-brand-assets.zip",
	mark: {
		light: {
			svg: "/branding/svg/better-auth-mark-light.svg",
			png: "/branding/png/better-auth-mark-light.png",
		},
		dark: {
			svg: "/branding/svg/better-auth-mark-dark.svg",
			png: "/branding/png/better-auth-mark-dark.png",
		},
	},
	wordmark: {
		light: {
			svg: "/branding/svg/better-auth-wordmark-light.svg",
			png: "/branding/png/better-auth-wordmark-light.png",
		},
		dark: {
			svg: "/branding/svg/better-auth-wordmark-dark.svg",
			png: "/branding/png/better-auth-wordmark-dark.png",
		},
	},
} as const;

export const brandLogoPreviews = [
	{
		label: "Mark · Light",
		src: brandAssetPaths.mark.light.svg,
		bg: "bg-black",
	},
	{
		label: "Mark · Dark",
		src: brandAssetPaths.mark.dark.svg,
		bg: "bg-white",
	},
	{
		label: "Wordmark · Light",
		src: brandAssetPaths.wordmark.light.svg,
		bg: "bg-black",
	},
	{
		label: "Wordmark · Dark",
		src: brandAssetPaths.wordmark.dark.svg,
		bg: "bg-white",
	},
] as const;
