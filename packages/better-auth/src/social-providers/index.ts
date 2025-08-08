import * as z from "zod/v4";
import type { Prettify } from "../types/helper";
import { apple } from "./apple";
import { discord } from "./discord";
import { facebook } from "./facebook";
import { github } from "./github";
import { google } from "./google";
import { kick } from "./kick";
import { huggingface } from "./huggingface";
import { microsoft } from "./microsoft-entra-id";
import { slack } from "./slack";
import { notion } from "./notion";
import { spotify } from "./spotify";
import { twitch } from "./twitch";
import { twitter } from "./twitter";
import { dropbox } from "./dropbox";
import { linear } from "./linear";
import { linkedin } from "./linkedin";
import { gitlab } from "./gitlab";
import { tiktok } from "./tiktok";
import { reddit } from "./reddit";
import { roblox } from "./roblox";
import { vk } from "./vk";
import { zoom } from "./zoom";
export const socialProviders = {
	apple,
	discord,
	facebook,
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
	vk,
	zoom,
	notion,
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
	[K in SocialProviderList[number]]?: Prettify<
		Parameters<(typeof socialProviders)[K]>[0] & {
			enabled?: boolean;
		}
	>;
};

export * from "./apple";
export * from "./discord";
export * from "./dropbox";
export * from "./facebook";
export * from "./github";
export * from "./linear";
export * from "./linkedin";
export * from "./gitlab";
export * from "./google";
export * from "./kick";
export * from "./linkedin";
export * from "./microsoft-entra-id";
export * from "./notion";
export * from "./reddit";
export * from "./roblox";
export * from "./spotify";
export * from "./tiktok";
export * from "./twitch";
export * from "./twitter";
export * from "./vk";
export * from "./zoom";
export * from "./kick";
export * from "./huggingface";
export * from "./slack";

export type SocialProviderList = typeof socialProviderList;
