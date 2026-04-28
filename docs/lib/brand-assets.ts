export const brandAssetPaths = {
	assetsZip: "/branding/better-auth-brand-assets.zip",
	mark: {
		onLight: {
			svg: "/branding/svg/better-auth-mark-dark.svg",
			png: "/branding/png/better-auth-mark-dark.png",
		},
		onDark: {
			svg: "/branding/svg/better-auth-mark-light.svg",
			png: "/branding/png/better-auth-mark-light.png",
		},
	},
	wordmark: {
		onLight: {
			svg: "/branding/svg/better-auth-wordmark-dark.svg",
			png: "/branding/png/better-auth-wordmark-dark.png",
		},
		onDark: {
			svg: "/branding/svg/better-auth-wordmark-light.svg",
			png: "/branding/png/better-auth-wordmark-light.png",
		},
	},
} as const;

export const brandLogoPreviews = [
	{
		label: "Mark · Light",
		src: brandAssetPaths.mark.onLight.svg,
		bg: "bg-white",
	},
	{
		label: "Mark · Dark",
		src: brandAssetPaths.mark.onDark.svg,
		bg: "bg-black",
	},
	{
		label: "Wordmark · Light",
		src: brandAssetPaths.wordmark.onLight.svg,
		bg: "bg-white",
	},
	{
		label: "Wordmark · Dark",
		src: brandAssetPaths.wordmark.onDark.svg,
		bg: "bg-black",
	},
] as const;
