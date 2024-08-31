import { useStore } from "@nanostores/react";
export const useAuthStore = useStore;

import type { BetterFetchOption } from "@better-fetch/fetch";
import { createAuthClient as createVanillaClient } from "./base";

export const createAuthClient = (options?: BetterFetchOption) => {
	const client = createVanillaClient(options);
	return Object.assign(client);
};
