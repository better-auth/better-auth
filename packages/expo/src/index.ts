import { type BetterFetchOption } from "@better-fetch/fetch";
import type { BetterAuthClientPlugin } from "better-auth";
import { createAuthClient } from "../../better-auth/src/client";

interface ExpoClientOptions {
	baseURL: string;
	fetchOptions?: BetterFetchOption;
	plugins?: BetterAuthClientPlugin[];
}

export const createExpoClient = <O extends ExpoClientOptions>(options: O) => {
	const baseClient = createAuthClient({
		disableDefaultFetchPlugins: true,
		baseURL: options.baseURL,
		plugins: options.plugins,
	});
	return baseClient;
};
