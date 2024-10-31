import {
	BetterFetchError,
	type BetterFetch,
	type BetterFetchOption,
} from "@better-fetch/fetch";
import { atom, onMount, type PreinitializedWritableAtom } from "nanostores";

export const useAuthQuery = <T>(
	initializedAtom:
		| PreinitializedWritableAtom<any>
		| PreinitializedWritableAtom<any>[],
	path: string,
	$fetch: BetterFetch,
	options?:
		| ((value: {
				data: null | T;
				error: null | BetterFetchError;
				isPending: boolean;
		  }) => BetterFetchOption)
		| BetterFetchOption,
) => {
	const value = atom<{
		data: null | T;
		error: null | BetterFetchError;
		isPending: boolean;
		isRefetching: boolean;
	}>({
		data: null,
		error: null,
		isPending: true,
		isRefetching: false,
	});

	const fn = () => {
		const opts =
			typeof options === "function"
				? options({
						data: value.get().data,
						error: value.get().error,
						isPending: value.get().isPending,
					})
				: options;

		return $fetch<T>(path, {
			...opts,
			onSuccess: async (context) => {
				value.set({
					data: context.data,
					error: null,
					isPending: false,
					isRefetching: false,
				});
				await opts?.onSuccess?.(context);
			},
			async onError(context) {
				value.set({
					error: context.error,
					data: null,
					isPending: false,
					isRefetching: false,
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
				});
				await opts?.onRequest?.(context);
			},
		});
	};

	initializedAtom = Array.isArray(initializedAtom)
		? initializedAtom
		: [initializedAtom];
	let isMounted = false;
	for (const initAtom of initializedAtom) {
		initAtom.subscribe(() => {
			if (isMounted) {
				fn();
			} else {
				onMount(value, () => {
					fn();
					isMounted = true;
					return () => {
						value.off();
						initAtom.off();
					};
				});
			}
		});
	}
	return value;
};
