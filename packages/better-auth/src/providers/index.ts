import { github } from "./github";
import { google } from "./google";

export const oAuthProviders = {
	github,
	google,
};

export const oAuthProviderList = Object.keys(oAuthProviders) as [
	"github",
	...(keyof typeof oAuthProviders)[],
];

export * from "./github";
export * from "./google";
export * from "../plugins/passkey";
export * from "../types/provider";
