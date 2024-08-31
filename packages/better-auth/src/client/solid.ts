import type { ClientOptions } from "./type";
import { createAuthClient as createClient } from "./base";
import { useStore } from "@nanostores/solid";
import type * as SolidJS from "solid-js"; //to fix ts error: This is likely not portable. A type annotation is necessary.
export const createAuthClient = <Option extends ClientOptions>(
	options?: Option,
) => {
	const client = createClient(options);

	function useSession() {
		return useStore(client.$atoms.$session);
	}
	const obj = Object.assign(client, {
		useSession,
	});
	return obj;
};
