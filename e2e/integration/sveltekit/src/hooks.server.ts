import type { Handle } from "@sveltejs/kit/hooks";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { auth } from "#lib/auth.js";
import { building } from "$app/env";

export const handle: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({
		headers: event.request.headers,
	});
	event.locals.userName = session?.user.name ?? null;
	return svelteKitHandler({ event, resolve, auth, building });
};
