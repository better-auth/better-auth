export type ErrorRedirectParams = {
	error: string;
	error_description?: string | undefined;
};

export type ErrorUrlBuilder = (args: {
	error: string;
	error_description?: string | undefined;
	baseURL: string;
}) => string | Promise<string>;

export type MergeErrorRedirectUrlOptions = {
	/**
	 * Replace existing `error` / `error_description` keys. Error-page redirects
	 * leave app-owned keys in place (`false`). OAuth `redirect_uri` errors set
	 * the protocol parameters (`true`).
	 *
	 * @default false
	 */
	overwrite?: boolean;
};

function splitUrl(url: string): {
	path: string;
	query: string;
	fragment: string;
} {
	const hashIndex = url.indexOf("#");
	const urlWithoutFragment = hashIndex === -1 ? url : url.slice(0, hashIndex);
	const fragment = hashIndex === -1 ? "" : url.slice(hashIndex);
	const queryIndex = urlWithoutFragment.indexOf("?");
	const path =
		queryIndex === -1
			? urlWithoutFragment
			: urlWithoutFragment.slice(0, queryIndex);
	const query =
		queryIndex === -1 ? "" : urlWithoutFragment.slice(queryIndex + 1);
	return { path, query, fragment };
}

/**
 * Merge query parameters into a URL without introducing a second `?` and
 * without re-serializing the origin (so registered `redirect_uri` text stays
 * intact).
 */
export function mergeRedirectQueryParams(
	url: string,
	params: Record<string, string>,
	options?: MergeErrorRedirectUrlOptions,
): string {
	const overwrite = options?.overwrite === true;
	const { path, query, fragment } = splitUrl(url);
	const searchParams = new URLSearchParams(query);
	for (const [key, value] of Object.entries(params)) {
		if (overwrite || !searchParams.has(key)) {
			searchParams.set(key, value);
		}
	}
	const qs = searchParams.toString();
	return qs ? `${path}?${qs}${fragment}` : `${path}${fragment}`;
}

/**
 * Merge `error` / `error_description` into an error-page URL without introducing
 * a second `?` and without overwriting keys the app already set.
 */
export function mergeErrorRedirectUrl(
	url: string,
	params: ErrorRedirectParams,
	options?: MergeErrorRedirectUrlOptions,
): string {
	const incoming: Record<string, string> = { error: params.error };
	if (params.error_description !== undefined) {
		incoming.error_description = params.error_description;
	}
	return mergeRedirectQueryParams(url, incoming, options);
}

export async function resolveErrorRedirectUrl(
	options:
		| {
				onAPIError?:
					| {
							errorURL?: string | undefined;
							errorUrlBuilder?: ErrorUrlBuilder | undefined;
					  }
					| undefined;
		  }
		| undefined,
	baseURL: string,
	params: ErrorRedirectParams,
): Promise<string> {
	const builder = options?.onAPIError?.errorUrlBuilder;
	if (builder) {
		return await builder({
			error: params.error,
			error_description: params.error_description,
			baseURL,
		});
	}
	return mergeErrorRedirectUrl(baseURL, params);
}
