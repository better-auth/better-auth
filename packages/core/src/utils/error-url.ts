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

/**
 * Merge `error` / `error_description` into an error-page URL without introducing
 * a second `?` and without overwriting keys the app already set.
 */
export function mergeErrorRedirectUrl(
	url: string,
	params: ErrorRedirectParams,
	options?: MergeErrorRedirectUrlOptions,
): string {
	const incoming: Array<[string, string]> = [["error", params.error]];
	if (params.error_description) {
		incoming.push(["error_description", params.error_description]);
	}
	const overwrite = options?.overwrite === true;

	const apply = (searchParams: URLSearchParams) => {
		for (const [key, value] of incoming) {
			if (overwrite || !searchParams.has(key)) {
				searchParams.set(key, value);
			}
		}
	};

	try {
		const isRelativePath = url.startsWith("/") && !url.startsWith("//");
		const parsedUrl = new URL(url, "http://better-auth.local");
		apply(parsedUrl.searchParams);
		if (isRelativePath) {
			return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
		}
		return parsedUrl.toString();
	} catch {
		const hashIndex = url.indexOf("#");
		const urlWithoutFragment = hashIndex === -1 ? url : url.slice(0, hashIndex);
		const fragment = hashIndex === -1 ? "" : url.slice(hashIndex);
		const queryIndex = urlWithoutFragment.indexOf("?");
		const path =
			queryIndex === -1
				? urlWithoutFragment
				: urlWithoutFragment.slice(0, queryIndex);
		const existing = new URLSearchParams(
			queryIndex === -1 ? "" : urlWithoutFragment.slice(queryIndex + 1),
		);
		apply(existing);
		const qs = existing.toString();
		return qs ? `${path}?${qs}${fragment}` : `${path}${fragment}`;
	}
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
