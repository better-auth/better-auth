import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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

export const baseUrl =
	process.env.NODE_ENV === "development" ||
	(!process.env.VERCEL_PROJECT_PRODUCTION_URL && !process.env.VERCEL_URL)
		? new URL("http://localhost:3000")
		: new URL(
				`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL}`,
			);