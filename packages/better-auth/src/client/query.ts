import {
	type BetterFetch,
	BetterFetchError,
	type BetterFetchOption,
} from "@better-fetch/fetch";
import { atom, onMount, type PreinitializedWritableAtom } from "nanostores";
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
				  }) => BetterFetchOption)
				| BetterFetchOption
		  )
		| undefined,
) => {
	const value = atom<{
		data: null | T;
		error: null | BetterFetchError;
		isPending: boolean;
		isRefetching: boolean;
		refetch: (queryParams?: { query?: SessionQueryParams } | undefined) => void;
	}>({
		data: null,
		error: null,
		isPending: true,
		isRefetching: false,
		refetch: (queryParams?: { query?: SessionQueryParams } | undefined) => {
			return fn(queryParams);
		},
	});

	const fn = (queryParams?: { query?: SessionQueryParams } | undefined) => {
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
		}).catch((error) => {
			value.set({
				error,
				data: null,
				isPending: false,
				isRefetching: false,
				refetch: value.value.refetch,
			});
		});
	};
	initializedAtom = Array.isArray(initializedAtom)
		? initializedAtom
		: [initializedAtom];
	let isMounted = false;

	for (const initAtom of initializedAtom) {
		initAtom.subscribe(() => {
			if (isServer()) {
				// On server, don't trigger fetch
				return;
			}
			if (isMounted) {
				fn();
			} else {
				onMount(value, () => {
					const timeoutId = setTimeout(() => {
						if (!isMounted) {
							fn();
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
