import type {
	AuthContext,
	BetterAuthOptions,
	ThemeConfig,
	UIContext,
} from "@better-auth/core";
import { getOrigin } from "../utils/url";

export const DEFAULT_UI_BASE_PATH = "/auth";

export const defaultTheme: ThemeConfig = {
	primary: "oklch(0.216 0.006 56.043)",
	background: "oklch(1 0 0)",
	surface: "oklch(1 0 0)",
	text: "oklch(0.147 0.004 49.25)",
	textSecondary: "oklch(0.553 0.013 58.071)",
	border: "oklch(0.923 0.003 48.717)",
	error: "oklch(0.577 0.245 27.325)",
	success: "#16a34a",
	borderRadius: "md",
	dark: {
		primary: "oklch(0.985 0.001 106.423)",
		background: "hsl(0 0% 0%)",
		surface: "oklch(0.147 0.004 49.25)",
		text: "oklch(0.985 0.001 106.423)",
		textSecondary: "oklch(0.709 0.01 56.259)",
		border: "oklch(0.268 0.007 34.298)",
		error: "oklch(0.396 0.141 25.723)",
	},
};

export function normalizeUIBasePath(basePath?: string) {
	if (!basePath || basePath === "/") return "";
	const prefixed = basePath.startsWith("/") ? basePath : `/${basePath}`;
	return prefixed.replace(/\/+$/, "");
}

export function getUIBasePath(options: BetterAuthOptions) {
	return normalizeUIBasePath(options.ui?.basePath ?? DEFAULT_UI_BASE_PATH);
}

export function getUIRuntimePath(options: BetterAuthOptions) {
	return `${getUIBasePath(options)}/_ba/runtime.js`;
}

export function getTheme(options: BetterAuthOptions): ThemeConfig {
	return {
		...defaultTheme,
		appName: options.ui?.theme?.appName ?? options.appName,
		...options.ui?.theme,
	};
}

export function getUIOrigin(ctx: AuthContext) {
	const origin = getOrigin(ctx.baseURL);
	return origin || "";
}

export function getUIURL(ctx: AuthContext, path: string) {
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	return `${getUIOrigin(ctx)}${getUIBasePath(ctx.options)}${normalizedPath}`;
}

export function getUIErrorURL(ctx: AuthContext) {
	return ctx.options.onAPIError?.errorURL || getUIURL(ctx, "/error");
}

export function getSafeUIRedirectTo(ctx: UIContext, fallback = "/") {
	const candidates = [
		ctx.query.get("redirectTo"),
		ctx.query.get("callbackURL"),
		ctx.context.options.ui?.defaultRedirectTo,
		fallback,
		"/",
	];
	for (const candidate of candidates) {
		if (!candidate) continue;
		if (
			ctx.context.isTrustedOrigin(candidate, {
				allowRelativePaths: true,
			})
		) {
			return candidate;
		}
	}
	return "/";
}

export function appendQuery(url: string, query: URLSearchParams) {
	const separator = url.includes("?") ? "&" : "?";
	return `${url}${separator}${query.toString()}`;
}
