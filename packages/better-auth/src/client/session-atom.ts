import type { BetterFetch } from "@better-fetch/fetch";
import { atom, computed, task } from "nanostores";
import type { Auth as BetterAuth } from "../auth";
import type { Prettify } from "../types/helper";
import type { InferSession, InferUser } from "../types/models";
import type { AuthClientPlugin, ClientOptions } from "./types";

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
	const $session = computed($signal, () =>
		task(async () => {
			const session = await client("/session", {
				credentials: "include",
				method: "GET",
			});
			return session.data as {
				user: Prettify<UserWithAdditionalFields>;
				session: Prettify<SessionWithAdditionalFields>;
			} | null;
		}),
	);
	return { $session, _sessionSignal: $signal };
}
