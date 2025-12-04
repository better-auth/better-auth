import * as z from "zod";
import { apple } from "./apple";
import { atlassian } from "./atlassian";
import { cognito } from "./cognito";
import { discord } from "./discord";
import { dropbox } from "./dropbox";
import { facebook } from "./facebook";
import { figma } from "./figma";
import { github } from "./github";
import { gitlab } from "./gitlab";
import { google } from "./google";
import { huggingface } from "./huggingface";
import { kakao } from "./kakao";
import { kick } from "./kick";
import { line } from "./line";
import { linear } from "./linear";
import { linkedin } from "./linkedin";
import { microsoft } from "./microsoft-entra-id";
import { naver } from "./naver";
import { notion } from "./notion";
import { paybin } from "./paybin";
import { paypal } from "./paypal";
import { polar } from "./polar";
import { reddit } from "./reddit";
import { roblox } from "./roblox";
import { salesforce } from "./salesforce";
import { slack } from "./slack";
import { spotify } from "./spotify";
import { tiktok } from "./tiktok";
import { twitch } from "./twitch";
import { twitter } from "./twitter";
import { vercel } from "./vercel";
import { vk } from "./vk";
import { zoom } from "./zoom";

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
	vercel,
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
	[K in SocialProviderList[number]]?: Parameters<
		(typeof socialProviders)[K]
	>[0] & {
		enabled?: boolean | undefined;
	};
};

export * from "./apple";
export * from "./atlassian";
export * from "./cognito";
export * from "./discord";
export * from "./dropbox";
export * from "./facebook";
export * from "./figma";
export * from "./github";
export * from "./gitlab";
export * from "./google";
export * from "./huggingface";
export * from "./kakao";
export * from "./kick";
export * from "./kick";
export * from "./line";
export * from "./linear";
export * from "./linkedin";
export * from "./linkedin";
export * from "./microsoft-entra-id";
export * from "./naver";
export * from "./notion";
export * from "./paybin";
export * from "./paypal";
export * from "./polar";
export * from "./reddit";
export * from "./roblox";
export * from "./salesforce";
export * from "./slack";
export * from "./spotify";
export * from "./tiktok";
export * from "./twitch";
export * from "./twitter";
export * from "./vercel";
export * from "./vk";
export * from "./zoom";

export type SocialProviderList = typeof socialProviderList;
