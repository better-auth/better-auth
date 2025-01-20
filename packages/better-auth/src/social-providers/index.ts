import type { Prettify } from "../types";
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
import { reddit } from "./reddit";
import { roblox } from "./roblox";
import { z } from "zod";
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
	linkedin,
	gitlab,
	reddit,
	roblox,
};

export const socialProviderList = Object.keys(socialProviders) as [
	"github",
	...(keyof typeof socialProviders)[],
];

export type SocialProviderList = typeof socialProviderList;

export const SocialProviderListEnum = z.enum(socialProviderList, {
	description: "OAuth2 provider to use",
});

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
export * from "./reddit";
export * from "./roblox";