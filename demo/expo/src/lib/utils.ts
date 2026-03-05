import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import type { PressableStateCallbackType } from "react-native";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
export function isTextChildren(
	children:
		| React.ReactNode
		| ((state: PressableStateCallbackType) => React.ReactNode),
) {
	return Array.isArray(children)
		? children.every((child) => typeof child === "string")
		: typeof children === "string";
}
