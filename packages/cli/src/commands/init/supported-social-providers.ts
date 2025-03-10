export const supportedSocialProviders = [
	{
		id: "apple",
		label: "Apple",
		requiredKeys: ["clientId", "clientSecret"],
	},
	{
		id: "discord",
		label: "Discord",
		requiredKeys: ["clientId", "clientSecret"],
	},
	{
		id: "facebook",
		label: "Facebook",
		requiredKeys: ["clientId", "clientSecret"],
	},
	{
		id: "github",
		label: "GitHub",
		requiredKeys: ["clientId", "clientSecret"],
	},
	{
		id: "google",
		label: "Google",
		requiredKeys: ["clientId", "clientSecret"],
	},
	{
		id: "microsoft",
		label: "Microsoft",
		requiredKeys: ["clientId", "clientSecret"],
	},
	{
		id: "tiktok",
		label: "TikTok",
		requiredKeys: ["clientId", "clientSecret", "clientKey"],
	},
	{
		id: "twitch",
		label: "Twitch",
		requiredKeys: ["clientId", "clientSecret"],
	},
	{
		id: "twitter",
		label: "Twitter",
		requiredKeys: ["clientId", "clientSecret"],
	},
	{
		id: "dropbox",
		label: "Dropbox",
		requiredKeys: ["clientId", "clientSecret"],
	},
	{
		id: "linkedin",
		label: "LinkedIn",
		requiredKeys: ["clientId", "clientSecret"],
	},
	{
		id: "gitlab",
		label: "GitLab",
		requiredKeys: ["clientId", "clientSecret", "issuer"],
	},
	{
		id: "reddit",
		label: "Reddit",
		requiredKeys: ["clientId", "clientSecret"],
	},
	{
		id: "roblox",
		label: "Roblox",
		requiredKeys: ["clientId", "clientSecret"],
	},
	{
		id: "spotify",
		label: "Spotify",
		requiredKeys: ["clientId", "clientSecret"],
	},
	{
		id: "vk",
		label: "VK",
		requiredKeys: ["clientId", "clientSecret"],
	},
] as const;

export const supportedSocialProviderIds = [
	"apple",
	"discord",
	"facebook",
	"github",
	"google",
	"microsoft",
	"tiktok",
	"twitch",
	"twitter",
	"dropbox",
	"linkedin",
	"gitlab",
	"reddit",
	"roblox",
	"spotify",
	"vk",
] as const;

export type SupportedSocialProvider = (typeof supportedSocialProviders)[number];
