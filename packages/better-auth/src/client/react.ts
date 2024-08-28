import { useStore } from "@nanostores/react";
import { createVanillaClient } from "./base";
import { BetterFetchOption } from "@better-fetch/fetch";
import { BetterAuth } from "../auth";
import { InferSession, InferUser } from "../types";

export const createAuthClient = <Auth extends BetterAuth>(
	options?: BetterFetchOption,
) => {
	const client = createVanillaClient<Auth>(options);
	function useSession(
		initialValue: {
			user: InferUser<Auth>;
			session: InferSession<Auth>;
		} | null = null,
	) {
		const session = useStore(client.$atoms.$session);
		if (session) {
			return session;
		}
		return initialValue;
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
