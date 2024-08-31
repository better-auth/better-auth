import type { BetterFetchOption } from "@better-fetch/fetch";
import { useStore } from "@nanostores/vue";
import { createAuthClient as createVanillaClient } from "./base";

export const createAuthClient = (options?: BetterFetchOption) => {
	const client = createVanillaClient(options);
	return Object.assign(client);
};

export const useAuthStore = useStore;
