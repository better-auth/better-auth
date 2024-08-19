import { createAuthClient } from ".";
import { BetterAuth } from "../auth";
import { ClientOptions } from "./base";
import { useStore } from "@nanostores/react";

export const createReactAuthClient = <Auth extends BetterAuth = BetterAuth>(
	options?: ClientOptions,
) => {
	const client = createAuthClient<Auth>({
		...options,
	});
	const useSession = () => {
		const session = useStore(client.$session);
		return session;
	};
	return {
		useSession,
		...client,
	};
};
