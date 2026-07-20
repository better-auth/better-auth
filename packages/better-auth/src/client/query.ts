import type { ClientFetchOption } from "@better-auth/core";
import type { BetterFetch, BetterFetchError } from "@better-fetch/fetch";
import type { PreinitializedWritableAtom } from "nanostores";
import { atom, onMount } from "nanostores";
import { isJsonEqual, withEquality } from "./equality";
import type { SessionQueryParams } from "./types";

// SSR detection
const isServer = () => typeof window === "undefined";

export type AuthQueryState<T> = {
	data: null | T;
	error: null | BetterFetchError;
	isPending: boolean;
	isRefetching: boolean;
	refetch: (
		queryParams?: { query?: SessionQueryParams } | undefined,
	) => Promise<void>;
};

export type AuthQueryAtom<T> = PreinitializedWritableAtom<AuthQueryState<T>>;

function isAuthQueryStateEqual<T>(
	a: AuthQueryState<T>,
	b: AuthQueryState<T>,
): boolean {
	return (
		isJsonEqual(a.data, b.data) &&
		a.error === b.error &&
		a.isPending === b.isPending &&
		a.isRefetching === b.isRefetching &&
		a.refetch === b.refetch
	);
}

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
	const value: AuthQueryAtom<T> = atom({
		data: null,
		error: null,
		isPending: true,
		isRefetching: false,
		refetch: (queryParams) => fn(queryParams),
	});
	withEquality(value, isAuthQueryStateEqual);

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
					const current = value.get();
					const stableData =
						current.data != null &&
						context.data != null &&
						isJsonEqual(current.data, context.data)
							? current.data
							: context.data;
					value.set({
						data: stableData,
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
					const isUnauthorized = context.error.status === 401;
					value.set({
						error: context.error,
						data: isUnauthorized
							? null // clear session on HTTP 401
							: value.get().data, // preserve stale data on other errors
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
						data: value.get().data,
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
	let isMountFetchPending = false;
	let isMounted = false;
	let shouldRefetchAfterPending = false;

	const fetchOnMount = () => {
		if (isMountFetchPending) {
			shouldRefetchAfterPending = true;
			return;
		}
		isMountFetchPending = true;
		void fn().finally(() => {
			isMountFetchPending = false;
			const shouldRefetch = shouldRefetchAfterPending && isMounted;
			shouldRefetchAfterPending = false;
			if (shouldRefetch) fetchOnMount();
		});
	};

	onMount(value, () => {
		if (isServer()) {
			// On server, don't trigger fetch
			return;
		}

		isMounted = true;
		let isInitialized = false;
		let timeoutId: ReturnType<typeof setTimeout>;
		const cleanups = initializedAtom.map((initAtom) =>
			initAtom.listen(() => {
				if (isInitialized) {
					void fn();
				} else {
					isInitialized = true;
					clearTimeout(timeoutId);
					fetchOnMount();
				}
			}),
		);
		timeoutId = setTimeout(() => {
			isInitialized = true;
			fetchOnMount();
		}, 0);

		return () => {
			isMounted = false;
			for (const cleanup of cleanups) cleanup();
			clearTimeout(timeoutId);
		};
	});
	return value;
};
