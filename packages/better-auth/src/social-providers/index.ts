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

export const oAuthProviders = {
	apple,
	discord,
	facebook,
	github,
	microsoft,
	google,
	spotify,
	twitch,
	twitter,
};

export const oAuthProviderList = Object.keys(oAuthProviders) as [
	"github",
	...(keyof typeof oAuthProviders)[],
];

export type SocialProviders = typeof oAuthProviders extends {
	[key in infer K]: infer V;
}
	? V extends (options: infer V) => any
		? Partial<Record<K, Prettify<V & { enabled?: boolean }>>>
		: never
	: never;

export * from "./github";
export * from "./google";
export * from "./apple";
export * from "./microsoft-entra-id";
export * from "./discord";
export * from "./spotify";
export * from "./twitch";
export * from "./facebook";
export * from "./twitter";
export * from "./types";
