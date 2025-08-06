import { auth } from "$lib/auth";
import { redirect, type Handle } from "@sveltejs/kit";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { building } from "$app/environment";

export const handle: Handle = async ({ event, resolve }) => {
	if (event.route.id?.startsWith("/(protected)/")) {
		const session = await auth.api.getSession({
			headers: event.request.headers,
		});

		if (session) {
			event.locals.session = session?.session;
			event.locals.user = session?.user;

			return svelteKitHandler({ event, resolve, auth, building });
		} else {
			redirect(307, "/sign-in");
		}
	} else {
		return svelteKitHandler({ event, resolve, auth, building });
	}
};
