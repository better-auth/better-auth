import type { GenericEndpointContext } from "@better-auth/core";

type DefaultResolveMethodOptions =
	| {
			url?: never;
			context: GenericEndpointContext;
	  }
	| {
			url: string | URL;
			context?: never;
	  };

export function defaultResolveMethod({
	url,
	context,
}: DefaultResolveMethodOptions) {
	if (!context && !url) {
		return null;
	}
	const paths = [
		`/callback/${!context ? "" : ":id"}`,
		`/oauth2/callback/${!context ? "" : ":providerId"}`,
		"/sign-in/email",
		"/sign-up/email",
	];
	let path = !context
		? new URL(url.toString(), "http://localhost").pathname
		: context.path;
	if (!context) {
		if (paths.some((p) => path.includes(p))) {
			return path.split("/").pop() ?? null;
		}
	} else if (paths.includes(path)) {
		return (
			context.params?.id || context.params?.providerId || path.split("/").pop()
		);
	}
	if (path.includes("siwe")) return "siwe";
	if (path.includes("/passkey/verify-authentication")) {
		return "passkey";
	}

	return null;
}
