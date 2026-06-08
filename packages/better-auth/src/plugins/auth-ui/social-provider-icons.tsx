/** @jsxImportSource @better-auth/ui */

import type { UIChild } from "@better-auth/ui";

type ProviderIcon = UIChild | { dark: UIChild; light: UIChild };

function icon(src: string, title: string) {
	return <img src={src} alt="" aria-hidden="true" title={title} />;
}

export const KNOWN_PROVIDER_ICONS = {
	apple: {
		light: icon("https://svgl.app/library/apple.svg", "Apple logo (light)"),
		dark: icon("https://svgl.app/library/apple_dark.svg", "Apple logo (dark)"),
	},
	atlassian: icon("https://svgl.app/library/atlassian.svg", "Atlassian"),
	discord: icon("https://svgl.app/library/discord.svg", "Discord"),
	dropbox: icon("https://svgl.app/library/dropbox.svg", "Dropbox"),
	facebook: icon("https://svgl.app/library/facebook-icon.svg", "Facebook"),
	figma: icon("https://svgl.app/library/figma.svg", "Figma"),
	github: {
		light: icon(
			"https://svgl.app/library/github_light.svg",
			"Github logo (light)",
		),
		dark: icon(
			"https://svgl.app/library/github_dark.svg",
			"Github logo (dark)",
		),
	},
	gitlab: icon("https://svgl.app/library/gitlab.svg", "Gitlab"),
	google: icon("https://svgl.app/library/google.svg", "Google"),
	huggingface: icon("https://svgl.app/library/hugging_face.svg", "Huggingface"),
	kick: {
		light: icon("https://svgl.app/library/kick-light.svg", "Kick logo (light)"),
		dark: icon("https://svgl.app/library/kick-dark.svg", "Kick logo (dark)"),
	},
	linear: icon("https://svgl.app/library/linear.svg", "Linear"),
	linkedin: icon("https://svgl.app/library/linkedin.svg", "Linkedin"),
	microsoft: icon("https://svgl.app/library/microsoft.svg", "Microsoft"),
	notion: icon("https://svgl.app/library/notion.svg", "Notion"),
	paypal: icon("https://svgl.app/library/paypal.svg", "Paypal"),
	polar: {
		light: icon(
			"https://svgl.app/library/polar-sh_light.svg",
			"Polar logo (light)",
		),
		dark: icon(
			"https://svgl.app/library/polar-sh_dark.svg",
			"Polar logo (dark)",
		),
	},
	railway: {
		light: icon("https://svgl.app/library/railway.svg", "Railway logo (light)"),
		dark: icon(
			"https://svgl.app/library/railway_dark.svg",
			"Railway logo (dark)",
		),
	},
	reddit: icon("https://svgl.app/library/reddit.svg", "Reddit"),
	roblox: {
		light: icon(
			"https://svgl.app/library/roblox_light.svg",
			"Roblox logo (light)",
		),
		dark: icon("https://svgl.app/library/roblox.svg", "Roblox logo (dark)"),
	},
	salesforce: icon("https://svgl.app/library/salesforce.svg", "Salesforce"),
	slack: icon("https://svgl.app/library/slack.svg", "Slack"),
	spotify: icon("https://svgl.app/library/spotify.svg", "Spotify"),
	tiktok: {
		light: icon(
			"https://svgl.app/library/tiktok-icon-light.svg",
			"Tiktok logo (light)",
		),
		dark: icon(
			"https://svgl.app/library/tiktok-icon-dark.svg",
			"Tiktok logo (dark)",
		),
	},
	twitch: icon("https://svgl.app/library/twitch.svg", "Twitch"),
	twitter: icon("https://svgl.app/library/twitter.svg", "Twitter"),
	vercel: {
		light: icon("https://svgl.app/library/vercel.svg", "Vercel logo (light)"),
		dark: icon(
			"https://svgl.app/library/vercel_dark.svg",
			"Vercel logo (dark)",
		),
	},
	vk: icon("https://svgl.app/library/vk.svg", "Vk"),
	zoom: icon("https://svgl.app/library/zoom.svg", "Zoom"),
} satisfies Record<string, ProviderIcon>;
