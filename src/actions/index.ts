import { type HandlerOptions, toContext, toResponse } from "..";
import type { BetterAuthOptions } from "../options";
import { getServerSession } from "../routes/session";
import { signInHandler } from "../routes/signin";
import { signOutHandler } from "../routes/signout";
import type { InferProviderSignin } from "./types";

export function getActions<O extends BetterAuthOptions>(
	options: O,
	handlerOptions?: HandlerOptions,
) {
	return {
		/**
		 * Sign in with a provider. This action will return response object. If
		 * it's oauth, it will redirect to the provider. If it's custom, it
		 * will return the response object and it'll set the cookies.
		 *
		 * ► In most cases you should just be using
		 * client sdk  for sign in instead unless you
		 * have a good reason to use this.
		 */
		signIn: async <
			T extends InferProviderSignin<O["providers"]>,
			K extends keyof T,
		>(
			request: Request | Headers,
			input: {
				provider: K;
				data?: T[K]["input"];
			},
		) => {
			const url =
				request instanceof Headers
					? (request.get("referer") as string)
					: request.url;
			const req = new Request(url, {
				body: JSON.stringify(input),
				method: "POST",
			});
			const context = await toContext(options, req);
			context.disableCSRF = true;
			context.request.body = {
				currentURL: url,
				provider: input.provider,
			};
			const response = await signInHandler(context);
			if (response.body.redirect) {
				return toResponse(
					{
						status: 302,
						headers: {
							Location: response.body.url,
						},
					},
					context,
				) as Response;
			}
			return toResponse(response, context, handlerOptions) as Response;
		},
		/**
		 * Get the current logged in user session.
		 */
		getSession: async (request: Request | Headers) => {
			const url =
				request instanceof Headers
					? (request.get("referer") as string)
					: request.url;
			const req =
				request instanceof Request
					? request
					: new Request(url, {
							method: "POST",
							body: JSON.stringify({}),
							headers: request,
						});
			const context = await toContext(options, req);
			context.disableCSRF = true;
			const response = await getServerSession(context);
			return response;
		},
		/**
		 * Signout the current user.
		 * Delete the session and clear the cookies.
		 */
		signOut: async (request: Request | Headers): Promise<Response> => {
			const url =
				request instanceof Headers
					? (request.get("referer") as string)
					: request.url;
			const req =
				request instanceof Request
					? request
					: new Request(url, {
							method: "POST",
							body: JSON.stringify({}),
							headers: request,
						});
			const context = await toContext(options, req);
			context.disableCSRF = true;
			const response = await signOutHandler(context);
			return toResponse(response, context, handlerOptions);
		},
	};
}
