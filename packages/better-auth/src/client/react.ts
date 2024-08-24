import { useStore } from "@nanostores/react";
import { createVanillaClient } from "./base";
import { BetterFetchOption } from "@better-fetch/fetch";
import { BetterAuth } from "../auth";

export const createAuthClient = <Auth extends BetterAuth>(
	options?: BetterFetchOption,
) => {
	const client = createVanillaClient<Auth>(options);
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

export const useAuthStore = useStore;
