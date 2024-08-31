import type { BetterFetchOption } from "@better-fetch/fetch";
import { useStore } from "@nanostores/vue";
import { createAuthClient as createClient } from "./base";

export const createAuthClient = <O extends BetterFetchOption>(options?: O) => {
	const client = createClient(options);
	function useSession() {
		return useStore(client.$atoms.$session);
	}
	const obj = Object.assign(client, {
		useSession,
	});
	return obj;
};

export const useAuthStore = useStore;
