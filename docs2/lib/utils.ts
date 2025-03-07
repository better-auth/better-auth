import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function absoluteUrl(path: string) {
	return `${process.env.NEXT_PUBLIC_APP_URL}${path}`;
}
export function kFormatter(num: number) {
	return Math.abs(num) > 999
		? Math.sign(num) * parseFloat((Math.abs(num) / 1000).toFixed(1)) + "k"
		: Math.sign(num) * Math.abs(num);
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
