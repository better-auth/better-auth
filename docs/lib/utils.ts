import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import type * as React from "react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function absoluteUrl(path: string) {
	return `${process.env.NEXT_PUBLIC_APP_URL}${path}`;
}
export function kFormatter(num: number) {
	const absNum = Math.abs(num);
	const sign = Math.sign(num);

	if (absNum >= 1000000000) {
		return sign * parseFloat((absNum / 1000000000).toFixed(1)) + "B+";
	} else if (absNum >= 1000000) {
		return sign * parseFloat((absNum / 1000000).toFixed(1)) + "M+";
	} else if (absNum >= 1000) {
		return sign * parseFloat((absNum / 1000).toFixed(1)) + "K+";
	}
	return sign * absNum;
}

export const baseUrl =
	process.env.NODE_ENV === "development" || !process.env.VERCEL_URL
		? new URL("http://localhost:3000")
		: new URL(`https://${process.env.VERCEL_URL}`);
export function formatDate(date: Date) {
	let d = new Date(date);
	return d
		.toLocaleDateString("en-US", { month: "short", day: "numeric" })
		.replace(",", "");
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
