import { authClient } from "~/lib/auth-client";

export default defineNuxtRouteMiddleware(async (to, from) => {
	const { data: session } = await authClient.useSession(useFetch);
	if (!session.value) {
		if (to.path === "/dashboard") {
			return navigateTo("/");
		}
	}
});
