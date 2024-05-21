import { auth } from "$lib/auth/server";
import { svelteKitHandler } from "better-auth/svelte-kit";

export async function handle({ event, resolve }) {
	return svelteKitHandler({ auth, event, resolve });
}