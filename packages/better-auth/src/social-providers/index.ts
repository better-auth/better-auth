import { apple } from "./apple";
import { discord } from "./discord";
import { github } from "./github";
import { google } from "./google";
import { spotify } from "./spotify";
import { twitch } from "./twitch";
import { twitter } from "./twitter";

export const oAuthProviders = {
	github,
	google,
	apple,
	discord,
	spotify,
	twitch,
	twitter,
};

export const oAuthProviderList = Object.keys(oAuthProviders) as [
	"github",
	...(keyof typeof oAuthProviders)[],
];

export * from "./github";
export * from "./google";
export * from "./apple";
export * from "./discord";
export * from "./spotify";
export * from "./twitch";
export * from "./twitter";
export * from "../types/provider";
