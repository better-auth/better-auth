import type { Auth } from "../auth";
import type { BetterAuthOptions } from "../types";

export const toSvelteKitHandler = (auth: {
	handler: (request: Request) => any;
	options: BetterAuthOptions;
}) => {
	return (event: { request: Request }) => auth.handler(event.request);
};

export const svelteKitHandler = async ({
  auth,
  event,
  resolve,
}: {
  auth: {
    handler: (request: Request) => any;
    options: BetterAuthOptions;
  };
  event: { request: Request; url: URL; locals: { session?: any } };
  resolve: (event: any) => any;
}) => {
  //@ts-expect-error
  const { building } = await import("$app/environment")
    .catch(() => {})
    .then((m) => m || {});

  if (building) {
    return resolve(event);
  }

  // Retrieve session and attach to event.locals
  const session = await auth.api.getSession({
		headers: event.request.headers
	});
event.locals.session = session?.session;
event.locals.user = session?.user;

  const { request, url } = event;
  if (isAuthPath(url.toString(), auth.options)) {
    return auth.handler(request);
  }

  return resolve(event);
};


export function isAuthPath(url: string, options: BetterAuthOptions) {
	const _url = new URL(url);
	const baseURL = new URL(
		`${options.baseURL || _url.origin}${options.basePath || "/api/auth"}`,
	);
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
