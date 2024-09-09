import type { BetterFetch } from "@better-fetch/fetch";
import { atom } from "nanostores";
import type { Auth as BetterAuth } from "../auth";
import type { Prettify } from "../types/helper";
import type { InferSession, InferUser } from "../types/models";
import type { AuthClientPlugin, ClientOptions } from "./types";
import { useAuthQuery } from "./query";

export function getSessionAtom<Option extends ClientOptions>(
	client: BetterFetch,
) {
	type Plugins = Option["plugins"] extends Array<AuthClientPlugin>
		? Array<Option["plugins"][number]["$InferServerPlugin"]>
		: undefined;

	type Auth = {
		handler: any;
		api: any;
		options: {
			database: any;
			plugins: Plugins;
		};
	};

	type UserWithAdditionalFields = InferUser<
		Auth extends BetterAuth ? Auth : never
	>;

	//@ts-expect-error
	type SessionWithAdditionalFields = InferSession<Auth["options"]>;
	const $signal = atom<boolean>(false);
	const session = useAuthQuery<{
		user: Prettify<UserWithAdditionalFields>;
		session: Prettify<SessionWithAdditionalFields>;
	}>($signal, "/session", client, {
		method: "GET",
	});
	return { $session: session, _sessionSignal: $signal };
}
