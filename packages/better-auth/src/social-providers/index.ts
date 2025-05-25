import type { Prettify } from "../types/helper";
import { apple } from "./apple";
import { discord } from "./discord";
import { facebook } from "./facebook";
import { github } from "./github";
import { google } from "./google";
import { microsoft } from "./microsoft-entra-id";
import { spotify } from "./spotify";
import { twitch } from "./twitch";
import { twitter } from "./twitter";
import { dropbox } from "./dropbox";
import { linkedin } from "./linkedin";
import { gitlab } from "./gitlab";
import { tiktok } from "./tiktok";
import { reddit } from "./reddit";
import { roblox } from "./roblox";
import { z } from "zod";
import { vk } from "./vk";
import { kick } from "./kick";
import { zoom } from "./zoom";
export const socialProviders = {
	apple,
	discord,
	facebook,
	github,
	microsoft,
	google,
	spotify,
	twitch,
	twitter,
	dropbox,
	kick,
	linkedin,
	gitlab,
	tiktok,
	reddit,
	roblox,
	vk,
	zoom,
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

export * from "./github";
export * from "./google";
export * from "./apple";
export * from "./microsoft-entra-id";
export * from "./discord";
export * from "./spotify";
export * from "./twitch";
export * from "./facebook";
export * from "./twitter";
export * from "./dropbox";
export * from "./linkedin";
export * from "./gitlab";
export * from "./tiktok";
export * from "./reddit";
export * from "./roblox";
export * from "./vk";
export * from "./zoom";
export * from "./kick";

export type SocialProviderList = typeof socialProviderList;
