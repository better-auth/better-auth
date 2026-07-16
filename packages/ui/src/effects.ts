import type { ClientEffect } from "@better-auth/core";
import type { BetterAuthUIEffect } from "./types";

export const effects = {
	toast(options: {
		level?: "info" | "success" | "warning" | "error";
		message: string;
	}): ClientEffect {
		return {
			type: "toast",
			level: options.level,
			message: options.message,
		};
	},
	toastFromError(options: { fallback: string }): BetterAuthUIEffect {
		return {
			type: "toastFromError",
			fallback: options.fallback,
		};
	},
	navigate(to: string): ClientEffect {
		return {
			type: "redirect",
			url: to,
		};
	},
	reload(): ClientEffect {
		return {
			type: "reload",
		};
	},
	show(target: string): ClientEffect {
		return {
			type: "show",
			target,
		};
	},
	hide(target: string): ClientEffect {
		return {
			type: "hide",
			target,
		};
	},
	openDialog(target: string): ClientEffect {
		return {
			type: "openDialog",
			target,
		};
	},
	closeDialog(target: string): ClientEffect {
		return {
			type: "closeDialog",
			target,
		};
	},
	set(
		key: string,
		value: string | number | boolean | null,
	): BetterAuthUIEffect {
		return {
			type: "set",
			key,
			value,
		};
	},
};
