import * as z from "zod";
import type { AwaitableFunction } from "../types/index.js";
import { apple } from "./apple.js";
import { atlassian } from "./atlassian.js";
import { cognito } from "./cognito.js";
import { discord } from "./discord.js";
import { dropbox } from "./dropbox.js";
import { facebook } from "./facebook.js";
import { figma } from "./figma.js";
import { github } from "./github.js";
import { gitlab } from "./gitlab.js";
import { google } from "./google.js";
import { huggingface } from "./huggingface.js";
import { kakao } from "./kakao.js";
import { kick } from "./kick.js";
import { line } from "./line.js";
import { linear } from "./linear.js";
import { linkedin } from "./linkedin.js";
import { microsoft } from "./microsoft-entra-id.js";
import { naver } from "./naver.js";
import { notion } from "./notion.js";
import { paybin } from "./paybin.js";
import { paypal } from "./paypal.js";
import { polar } from "./polar.js";
import { railway } from "./railway.js";
import { reddit } from "./reddit.js";
import { roblox } from "./roblox.js";
import { salesforce } from "./salesforce.js";
import { slack } from "./slack.js";
import { spotify } from "./spotify.js";
import { tiktok } from "./tiktok.js";
import { twitch } from "./twitch.js";
import { twitter } from "./twitter.js";
import { vercel } from "./vercel.js";
import { vk } from "./vk.js";
import { wechat } from "./wechat.js";
import { zoom } from "./zoom.js";

export const socialProviders = {
	apple,
	atlassian,
	cognito,
	discord,
	facebook,
	figma,
	github,
	microsoft,
	google,
	huggingface,
	slack,
	spotify,
	twitch,
	twitter,
	dropbox,
	kick,
	linear,
	linkedin,
	gitlab,
	tiktok,
	reddit,
	roblox,
	salesforce,
	vk,
	zoom,
	notion,
	kakao,
	naver,
	line,
	paybin,
	paypal,
	polar,
	railway,
	vercel,
	wechat,
};

export const socialProviderList = Object.keys(socialProviders) as [
	"github",
	...(keyof typeof socialProviders)[],
];

export const SocialProviderListEnum = z
	.enum(socialProviderList)
	.or(z.string()) as z.ZodType<SocialProviderList[number] | (string & {})>;

export type SocialProvider = z.infer<typeof SocialProviderListEnum>;

export type SocialProviders = {
	[K in SocialProviderList[number]]?: AwaitableFunction<
		Parameters<(typeof socialProviders)[K]>[0] & {
			enabled?: boolean | undefined;
		}
	>;
};

export * from "./apple.js";
export * from "./atlassian.js";
export * from "./cognito.js";
export * from "./discord.js";
export * from "./dropbox.js";
export * from "./facebook.js";
export * from "./figma.js";
export * from "./github.js";
export * from "./gitlab.js";
export * from "./google.js";
export * from "./huggingface.js";
export * from "./kakao.js";
export * from "./kick.js";
export * from "./line.js";
export * from "./linear.js";
export * from "./linkedin.js";
export * from "./microsoft-entra-id.js";
export * from "./naver.js";
export * from "./notion.js";
export * from "./paybin.js";
export * from "./paypal.js";
export * from "./polar.js";
export * from "./railway.js";
export * from "./reddit.js";
export * from "./roblox.js";
export * from "./salesforce.js";
export * from "./slack.js";
export * from "./spotify.js";
export * from "./tiktok.js";
export * from "./twitch.js";
export * from "./twitter.js";
export * from "./vercel.js";
export * from "./vk.js";
export * from "./wechat.js";
export * from "./zoom.js";

export type SocialProviderList = typeof socialProviderList;
