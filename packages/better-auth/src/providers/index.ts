import { github } from "./github";
import { google } from "./google";

export const providers = {
	github,
	google,
};

export const providerList = Object.keys(providers) as [
	"github",
	...(keyof typeof providers)[],
];

export * from "./github";
export * from "./google";
export * from "./types";
