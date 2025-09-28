import type { Prettify } from "better-auth";
import { z } from "zod";

import { phantom } from "./phantom";
import { solflare } from "./solflare";

export const walletProviders = {
	phantom,
	solflare,
};

export const walletProviderList = Object.keys(walletProviders) as [
	"phantom",
	...(keyof typeof walletProviders)[],
];

export type WalletProviderList = typeof walletProviderList;

export const WalletProviderListEnum = z
	.enum(walletProviderList)
	.or(z.string()) as z.ZodType<WalletProviderList[number] | (string & {})>;

export type WalletProvider = z.infer<typeof WalletProviderListEnum>;

export type WalletProviders = {
	[K in WalletProviderList[number]]?: Prettify<
		Parameters<(typeof walletProviders)[K]>[0] & {
			enabled?: boolean;
		}
	>;
};
