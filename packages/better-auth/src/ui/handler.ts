import type { AuthContext, BetterAuthOptions } from "@better-auth/core";
import type { BetterAuthUIConfig, SocialProvider } from "@better-auth/ui";
import { loadAssets } from "@better-auth/ui";

export type UIHandlerOptions = {
	context: Promise<AuthContext>;
	options: BetterAuthOptions;
};

function normalizePath(path: string): string {
	let normalized = path;
	if (!normalized.startsWith("/")) {
		normalized = "/" + normalized;
	}
	if (normalized.length > 1 && normalized.endsWith("/")) {
		normalized = normalized.slice(0, -1);
	}
	return normalized;
}

function getSocialProviders(options: BetterAuthOptions): SocialProvider[] {
	const providers: SocialProvider[] = [];

	if (options.socialProviders) {
		for (const [id, config] of Object.entries(options.socialProviders)) {
			if (config) {
				const name = id.charAt(0).toUpperCase() + id.slice(1);
				providers.push({ id, name });
			}
		}
	}

	return providers;
}

function getPageFromPath(
	relativePath: string,
): BetterAuthUIConfig["page"] | null {
	switch (relativePath) {
		case "/sign-in":
			return "sign-in";
		case "/sign-up":
			return "sign-up";
		case "/forgot-password":
			return "forgot-password";
		case "/reset-password":
			return "reset-password";
		case "/verify-email":
			return "verify-email";
		case "/profile":
			return "profile";
		default:
			return null;
	}
}

function createConfigScript(config: BetterAuthUIConfig): string {
	return `<script>window.__BETTER_AUTH_UI__=${JSON.stringify(config)};</script>`;
}

function injectConfig(html: string, config: BetterAuthUIConfig): string {
	const configScript = createConfigScript(config);
	return html.replace(
		"<!-- CONFIG_PLACEHOLDER: BetterAuth injects <script>window.__BETTER_AUTH_UI__ = {...}</script> here -->",
		configScript,
	);
}

function injectTitle(html: string, title: string): string {
	return html.replace("<title>Better Auth</title>", `<title>${title}</title>`);
}

function fixAssetPaths(html: string, assetsPath: string): string {
	return html
		.replace('src="/__better-auth/auth.js"', `src="${assetsPath}/auth.js"`)
		.replace('href="/__better-auth/auth.css"', `href="${assetsPath}/auth.css"`);
}

export function createUIHandler({ context, options }: UIHandlerOptions) {
	const uiOptions = options.ui;

	if (!uiOptions || uiOptions.enabled === false) {
		return async (_request: Request): Promise<Response> => {
			return new Response("Not Found", { status: 404 });
		};
	}

	const basePath = normalizePath(uiOptions.basePath ?? "/auth");
	const assetsPath = `${basePath}/__assets`;

	return async (request: Request): Promise<Response> => {
		if (request.method !== "GET") {
			return new Response("Method Not Allowed", {
				status: 405,
				headers: { Allow: "GET" },
			});
		}

		const url = new URL(request.url);
		const pathname = normalizePath(url.pathname);

		if (!pathname.startsWith(basePath)) {
			return new Response("Not Found", { status: 404 });
		}

		const assets = loadAssets();

		if (pathname === `${assetsPath}/auth.js`) {
			return new Response(assets.js, {
				headers: {
					"Content-Type": "application/javascript; charset=utf-8",
					"Cache-Control": "public, max-age=31536000, immutable",
				},
			});
		}

		if (pathname === `${assetsPath}/auth.css`) {
			return new Response(assets.css, {
				headers: {
					"Content-Type": "text/css; charset=utf-8",
					"Cache-Control": "public, max-age=31536000, immutable",
				},
			});
		}

		const relativePath = pathname.replace(basePath, "") || "/sign-in";
		const page = getPageFromPath(relativePath);

		if (!page) {
			return new Response("Not Found", { status: 404 });
		}

		const pages = uiOptions.pages || {};
		const pageSettings: Record<string, { enabled?: boolean } | undefined> = {
			"sign-in": pages.signIn,
			"sign-up": pages.signUp,
			"forgot-password": pages.forgotPassword,
			"reset-password": pages.resetPassword,
			"verify-email": pages.verifyEmail,
			profile: pages.profile,
		};

		if (pageSettings[page]?.enabled === false) {
			return new Response("Not Found", { status: 404 });
		}

		const ctx = await context;
		const apiBaseUrl =
			uiOptions.apiBaseUrl || `${ctx.baseURL}${ctx.options.basePath || ""}`;

		const config: BetterAuthUIConfig = {
			apiBaseUrl,
			appName: uiOptions.theme?.appName || ctx.appName,
			logo: uiOptions.theme?.logo,
			redirectTo: uiOptions.redirectTo || "/",
			socialProviders: getSocialProviders(options),
			features: {
				emailPassword: options.emailAndPassword?.enabled !== false,
				passkey: !!options.plugins?.some((p) => p.id === "passkey"),
				magicLink: !!options.plugins?.some((p) => p.id === "magic-link"),
				rememberMe: true,
				emailVerification: options.emailVerification?.sendOnSignUp ?? false,
			},
			paths: {
				signIn: `${basePath}/sign-in`,
				signUp: `${basePath}/sign-up`,
				forgotPassword: `${basePath}/forgot-password`,
				resetPassword: `${basePath}/reset-password`,
				verifyEmail: `${basePath}/verify-email`,
				profile: `${basePath}/profile`,
			},
			minPasswordLength: options.emailAndPassword?.minPasswordLength ?? 8,
			page,
		};

		const pageTitles: Record<BetterAuthUIConfig["page"], string> = {
			"sign-in": `Sign In - ${config.appName}`,
			"sign-up": `Sign Up - ${config.appName}`,
			"forgot-password": `Forgot Password - ${config.appName}`,
			"reset-password": `Reset Password - ${config.appName}`,
			"verify-email": `Verify Email - ${config.appName}`,
			profile: `Profile - ${config.appName}`,
		};

		let html = assets.html;
		html = fixAssetPaths(html, assetsPath);
		html = injectConfig(html, config);
		html = injectTitle(html, pageTitles[page]);

		return new Response(html, {
			headers: {
				"Content-Type": "text/html; charset=utf-8",
				"Cache-Control": "no-store",
			},
		});
	};
}
