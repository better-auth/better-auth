import { useStore } from "@nanostores/react";
export const useAuthStore = useStore;

import { createVanillaClient } from "./base";
import { BetterFetchOption } from "@better-fetch/fetch";

export const createAuthClient = (options?: BetterFetchOption) => {
	const client = createVanillaClient(options);
	function useSession() {
		return useStore(client.$atoms.$session);
	}
	function useActiveOrganization() {
		return useStore(client.$atoms.$activeOrganization);
	}
	function useListOrganization() {
		return useStore(client.$atoms.$listOrganizations);
	}
	return Object.assign(client, {
		useSession,
		useActiveOrganization,
		useListOrganization,
	});
};
