import type { GenericEndpointContext } from "@better-auth/core";

export async function handleErrorRedirect(
	c: GenericEndpointContext,
	errorParams: { error: string; error_description?: string },
	options?: {
		/**
		 * A specific error URL to use, which takes precedence over the global config.
		 */
		overrideErrorURL?: string;
		/**
		 * The default path to append to the baseURL if no errorURL is configured.
		 * @default "/error"
		 */
		defaultErrorPath?: string;
	},
) {
	let baseURL: string;

	if (options?.overrideErrorURL) {
		baseURL = options.overrideErrorURL;
	} else {
		const errorURLConfig = c.context.options.onAPIError?.errorURL;
		if (typeof errorURLConfig === "function") {
			baseURL = await errorURLConfig(errorParams);
		} else {
			const defaultPath = options?.defaultErrorPath || "/error";
			baseURL = errorURLConfig || `${c.context.baseURL}${defaultPath}`;
		}
	}

	const params = new URLSearchParams();
	params.set("error", errorParams.error);
	if (errorParams.error_description) {
		params.set("error_description", errorParams.error_description);
	}

	const sep = baseURL.includes("?") ? "&" : "?";
	const finalURL = `${baseURL}${sep}${params.toString()}`;

	// Return the redirect Error to be thrown by the caller
	return c.redirect(finalURL);
}
