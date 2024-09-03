//@ts-expect-error
import { building } from "$app/environment";
import type { Auth } from "../auth";
import type { BetterAuthOptions } from "../types";

export const toSvelteKitHandler = (auth: Auth) => {
	return (event: { request: Request }) => auth.handler(event.request);
};

export const svelteKitHandler = ({
	auth,
	event,
	resolve,
}: {
	auth: Auth;
	event: { request: Request; url: URL };
	resolve: (event: any) => any;
}) => {
	if (building) {
		return resolve(event);
	}
	const { request, url } = event;
	if (isAuthPath(url.toString(), auth.options)) {
		console.log("here");
		return auth.handler(request);
	}
	return resolve(event);
};

export function isAuthPath(url: string, options: BetterAuthOptions) {
	const _url = new URL(url);
	const baseURL = new URL(options.baseURL || `${_url.origin}/api/auth`);
	if (_url.origin !== baseURL.origin) return false;
	if (
		!_url.pathname.startsWith(
			baseURL.pathname.endsWith("/")
				? baseURL.pathname
				: `${baseURL.pathname}/`,
		)
	)
		return false;
	return true;
}
