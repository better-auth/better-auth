//@ts-expect-error
import { building } from "$app/environment";
import type { BetterAuth, BetterAuthHandler } from "..";
import { isAuthPath } from "../utils/request";

export const toSvelteKitHandler = (handler: BetterAuthHandler) => {
	return (event: { request: Request }) => handler(event.request);
};

export const svelteKitHandler = ({
	auth,
	event,
	resolve,
}: {
	auth: BetterAuth;
	event: { request: Request; url: URL };
	resolve: (event: any) => any;
}) => {
	if (building) {
		return resolve(event);
	}
	const { request, url } = event;
	if (isAuthPath(url.toString(), auth.options)) {
		return auth.handler(request);
	}
	return resolve(event);
};
