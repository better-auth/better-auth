import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

const ASSET_BASE_URL =
	process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

export function getSrc(path: string): string {
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	return ASSET_BASE_URL ? `${ASSET_BASE_URL}${normalizedPath}` : normalizedPath;
}

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function mergeRefs<T>(
	...refs: (React.Ref<T> | undefined)[]
): React.RefCallback<T> {
	return (value) => {
		refs.forEach((ref) => {
			if (typeof ref === "function") {
				ref(value);
			} else if (ref) {
				ref.current = value;
			}
		});
	};
}
