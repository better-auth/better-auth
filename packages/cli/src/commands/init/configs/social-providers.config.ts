export const SOCIAL_PROVIDERS = [
	"apple",
	"atlassian",
	"cognito",
	"discord",
	"dropbox",
	"facebook",
	"figma",
	"github",
	"gitlab",
	"google",
	"huggingface",
	"kakao",
	"kick",
	"line",
	"linear",
	"linkedin",
	"microsoft",
	"naver",
	"notion",
	"paybin",
	"paypal",
	"polar",
	"reddit",
	"roblox",
	"salesforce",
	"slack",
	"spotify",
	"tiktok",
	"twitch",
	"twitter",
	"vercel",
	"vk",
	"zoom",
] as const;

export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export type ProviderOption = {
	name: string;
	envVar: string;
};

export type ProviderConfig = {
	options: ProviderOption[];
};

/**
 * Configuration for each social provider specifying what options are required
 */
export const SOCIAL_PROVIDER_CONFIGS: Record<SocialProvider, ProviderConfig> = {
	apple: {
		options: [
			{ name: "clientId", envVar: "APPLE_CLIENT_ID" },
			{ name: "clientSecret", envVar: "APPLE_CLIENT_SECRET" },
		],
	},
	atlassian: {
		options: [
			{ name: "clientId", envVar: "ATLASSIAN_CLIENT_ID" },
			{ name: "clientSecret", envVar: "ATLASSIAN_CLIENT_SECRET" },
		],
	},
	cognito: {
		options: [
			{ name: "clientId", envVar: "COGNITO_CLIENT_ID" },
			{ name: "domain", envVar: "COGNITO_DOMAIN" },
			{ name: "region", envVar: "COGNITO_REGION" },
			{ name: "userPoolId", envVar: "COGNITO_USERPOOL_ID" },
		],
	},
	discord: {
		options: [
			{ name: "clientId", envVar: "DISCORD_CLIENT_ID" },
			{ name: "clientSecret", envVar: "DISCORD_CLIENT_SECRET" },
		],
	},
	dropbox: {
		options: [
			{ name: "clientId", envVar: "DROPBOX_CLIENT_ID" },
			{ name: "clientSecret", envVar: "DROPBOX_CLIENT_SECRET" },
		],
	},
	facebook: {
		options: [
			{ name: "clientId", envVar: "FACEBOOK_CLIENT_ID" },
			{ name: "clientSecret", envVar: "FACEBOOK_CLIENT_SECRET" },
		],
	},
	figma: {
		options: [
			{ name: "clientId", envVar: "FIGMA_CLIENT_ID" },
			{ name: "clientSecret", envVar: "FIGMA_CLIENT_SECRET" },
		],
	},
	github: {
		options: [
			{ name: "clientId", envVar: "GITHUB_CLIENT_ID" },
			{ name: "clientSecret", envVar: "GITHUB_CLIENT_SECRET" },
		],
	},
	gitlab: {
		options: [
			{ name: "clientId", envVar: "GITLAB_CLIENT_ID" },
			{ name: "clientSecret", envVar: "GITLAB_CLIENT_SECRET" },
		],
	},
	google: {
		options: [
			{ name: "clientId", envVar: "GOOGLE_CLIENT_ID" },
			{ name: "clientSecret", envVar: "GOOGLE_CLIENT_SECRET" },
		],
	},
	huggingface: {
		options: [
			{ name: "clientId", envVar: "HUGGINGFACE_CLIENT_ID" },
			{ name: "clientSecret", envVar: "HUGGINGFACE_CLIENT_SECRET" },
		],
	},
	kakao: {
		options: [
			{ name: "clientId", envVar: "KAKAO_CLIENT_ID" },
			{ name: "clientSecret", envVar: "KAKAO_CLIENT_SECRET" },
		],
	},
	kick: {
		options: [
			{ name: "clientId", envVar: "KICK_CLIENT_ID" },
			{ name: "clientSecret", envVar: "KICK_CLIENT_SECRET" },
		],
	},
	line: {
		options: [
			{ name: "clientId", envVar: "LINE_CLIENT_ID" },
			{ name: "clientSecret", envVar: "LINE_CLIENT_SECRET" },
		],
	},
	linear: {
		options: [
			{ name: "clientId", envVar: "LINEAR_CLIENT_ID" },
			{ name: "clientSecret", envVar: "LINEAR_CLIENT_SECRET" },
		],
	},
	linkedin: {
		options: [
			{ name: "clientId", envVar: "LINKEDIN_CLIENT_ID" },
			{ name: "clientSecret", envVar: "LINKEDIN_CLIENT_SECRET" },
		],
	},
	microsoft: {
		options: [
			{ name: "clientId", envVar: "MICROSOFT_CLIENT_ID" },
			{ name: "clientSecret", envVar: "MICROSOFT_CLIENT_SECRET" },
		],
	},
	naver: {
		options: [
			{ name: "clientId", envVar: "NAVER_CLIENT_ID" },
			{ name: "clientSecret", envVar: "NAVER_CLIENT_SECRET" },
		],
	},
	notion: {
		options: [
			{ name: "clientId", envVar: "NOTION_CLIENT_ID" },
			{ name: "clientSecret", envVar: "NOTION_CLIENT_SECRET" },
		],
	},
	paybin: {
		options: [
			{ name: "clientId", envVar: "PAYBIN_CLIENT_ID" },
			{ name: "clientSecret", envVar: "PAYBIN_CLIENT_SECRET" },
		],
	},
	paypal: {
		options: [
			{ name: "clientId", envVar: "PAYPAL_CLIENT_ID" },
			{ name: "clientSecret", envVar: "PAYPAL_CLIENT_SECRET" },
		],
	},
	polar: {
		options: [
			{ name: "clientId", envVar: "POLAR_CLIENT_ID" },
			{ name: "clientSecret", envVar: "POLAR_CLIENT_SECRET" },
		],
	},
	reddit: {
		options: [
			{ name: "clientId", envVar: "REDDIT_CLIENT_ID" },
			{ name: "clientSecret", envVar: "REDDIT_CLIENT_SECRET" },
		],
	},
	roblox: {
		options: [
			{ name: "clientId", envVar: "ROBLOX_CLIENT_ID" },
			{ name: "clientSecret", envVar: "ROBLOX_CLIENT_SECRET" },
		],
	},
	salesforce: {
		options: [
			{ name: "clientId", envVar: "SALESFORCE_CLIENT_ID" },
			{ name: "clientSecret", envVar: "SALESFORCE_CLIENT_SECRET" },
		],
	},
	slack: {
		options: [
			{ name: "clientId", envVar: "SLACK_CLIENT_ID" },
			{ name: "clientSecret", envVar: "SLACK_CLIENT_SECRET" },
		],
	},
	spotify: {
		options: [
			{ name: "clientId", envVar: "SPOTIFY_CLIENT_ID" },
			{ name: "clientSecret", envVar: "SPOTIFY_CLIENT_SECRET" },
		],
	},
	tiktok: {
		options: [
			{ name: "clientKey", envVar: "TIKTOK_CLIENT_KEY" },
			{ name: "clientSecret", envVar: "TIKTOK_CLIENT_SECRET" },
		],
	},
	twitch: {
		options: [
			{ name: "clientId", envVar: "TWITCH_CLIENT_ID" },
			{ name: "clientSecret", envVar: "TWITCH_CLIENT_SECRET" },
		],
	},
	twitter: {
		options: [
			{ name: "clientId", envVar: "TWITTER_CLIENT_ID" },
			{ name: "clientSecret", envVar: "TWITTER_CLIENT_SECRET" },
		],
	},
	vercel: {
		options: [
			{ name: "clientId", envVar: "VERCEL_CLIENT_ID" },
			{ name: "clientSecret", envVar: "VERCEL_CLIENT_SECRET" },
		],
	},
	vk: {
		options: [
			{ name: "clientId", envVar: "VK_CLIENT_ID" },
			{ name: "clientSecret", envVar: "VK_CLIENT_SECRET" },
		],
	},
	zoom: {
		options: [
			{ name: "clientId", envVar: "ZOOM_CLIENT_ID" },
			{ name: "clientSecret", envVar: "ZOOM_CLIENT_SECRET" },
		],
	},
};
