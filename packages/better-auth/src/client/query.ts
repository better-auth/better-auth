import type { ClientFetchOption } from "@better-auth/core";
import type { BetterFetch, BetterFetchError } from "@better-fetch/fetch";
import type { PreinitializedWritableAtom } from "nanostores";
import { atom, onMount } from "nanostores";
import type { SessionQueryParams } from "./types";

// SSR detection
const isServer = () => typeof window === "undefined";

export const useAuthQuery = <T>(
	initializedAtom:
		| PreinitializedWritableAtom<any>
		| PreinitializedWritableAtom<any>[],
	path: string,
	$fetch: BetterFetch,
	options?:
		| (
				| ((value: {
						data: null | T;
						error: null | BetterFetchError;
						isPending: boolean;
				  }) => ClientFetchOption)
				| ClientFetchOption
		  )
		| undefined,
) => {
	const value = atom<{
		data: null | T;
		error: null | BetterFetchError;
		isPending: boolean;
		isRefetching: boolean;
		refetch: (
			queryParams?: { query?: SessionQueryParams } | undefined,
		) => Promise<void>;
	}>({
		data: null,
		error: null,
		isPending: true,
		isRefetching: false,
		refetch: (queryParams) => fn(queryParams),
	});

	const fn = async (
		queryParams?: { query?: SessionQueryParams } | undefined,
	) => {
		return new Promise<void>((resolve) => {
			const opts =
				typeof options === "function"
					? options({
							data: value.get().data,
							error: value.get().error,
							isPending: value.get().isPending,
						})
					: options;

			$fetch<T>(path, {
				...opts,
				query: {
					...opts?.query,
					...queryParams?.query,
				},
				async onSuccess(context) {
					value.set({
						data: context.data,
						error: null,
						isPending: false,
						isRefetching: false,
						refetch: value.value.refetch,
					});
					await opts?.onSuccess?.(context);
				},
				async onError(context) {
					const { request } = context;
					const retryAttempts =
						typeof request.retry === "number"
							? request.retry
							: request.retry?.attempts;
					const retryAttempt = request.retryAttempt || 0;
					if (retryAttempts && retryAttempt < retryAttempts) return;
					value.set({
						error: context.error,
						data: null,
						isPending: false,
						isRefetching: false,
						refetch: value.value.refetch,
					});
					await opts?.onError?.(context);
				},
				async onRequest(context) {
					const currentValue = value.get();
					value.set({
						isPending: currentValue.data === null,
						data: currentValue.data,
						error: null,
						isRefetching: true,
						refetch: value.value.refetch,
					});
					await opts?.onRequest?.(context);
				},
			})
				.catch((error) => {
					value.set({
						error,
						data: null,
						isPending: false,
						isRefetching: false,
						refetch: value.value.refetch,
					});
				})
				.finally(() => {
					resolve(void 0);
				});
		});
	};
	initializedAtom = Array.isArray(initializedAtom)
		? initializedAtom
		: [initializedAtom];
	let isMounted = false;

	for (const initAtom of initializedAtom) {
		initAtom.subscribe(async () => {
			if (isServer()) {
				// On server, don't trigger fetch
				return;
			}
			if (isMounted) {
				await fn();
			} else {
				onMount(value, () => {
					const timeoutId = setTimeout(async () => {
						if (!isMounted) {
							await fn();
							isMounted = true;
						}
					}, 0);
					return () => {
						value.off();
						initAtom.off();
						clearTimeout(timeoutId);
					};
				});
			}
		});
	}
	return value;
};
