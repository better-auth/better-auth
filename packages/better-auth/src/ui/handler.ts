import type { AuthContext, BetterAuthOptions } from "@better-auth/core";
import type {
	BetterAuthUIConfig,
	PageName,
	SocialProvider,
} from "@better-auth/ui";
import { getPageTemplate, loadCSS, loadHydrate } from "@better-auth/ui";

export type UIHandlerOptions = {
	context: Promise<AuthContext>;
	options: BetterAuthOptions;
};

/**
 * Security headers for UI pages
 */
const SECURITY_HEADERS = {
	"X-Content-Type-Options": "nosniff",
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

/**
 * Parse embed mode and args from URL search params
 */
function parseEmbedParams(url: URL): {
	embed: boolean;
	args: Record<string, unknown>;
} {
	const embed = url.searchParams.get("embed") === "true";
	let args: Record<string, unknown> = {};

	const argsParam = url.searchParams.get("args");
	if (argsParam) {
		try {
			args = JSON.parse(atob(argsParam));
		} catch {
			console.warn("Failed to parse args query parameter");
		}
	}

	return { embed, args };
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

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Build the full HTML page with template, config, hydration, and CSS
 */
function buildHtmlPage(
	template: string,
	config: BetterAuthUIConfig,
	hydrate: string,
	css: string,
	title: string,
	metadata?: {
		title?: string;
		description?: string;
		image?: string;
		ogType?: string;
		twitterCard?: string;
		additionalMeta?: Array<{
			name?: string;
			property?: string;
			content: string;
		}>;
	},
	cssURL?: string,
): string {
	const metaTags: string[] = [];

	if (metadata) {
		if (metadata.description) {
			metaTags.push(
				`<meta name="description" content="${escapeHtml(metadata.description)}" />`,
			);
			metaTags.push(
				`<meta property="og:description" content="${escapeHtml(metadata.description)}" />`,
			);
		}
		if (metadata.title) {
			metaTags.push(
				`<meta property="og:title" content="${escapeHtml(metadata.title)}" />`,
			);
		}
		if (metadata.image) {
			metaTags.push(
				`<meta property="og:image" content="${escapeHtml(metadata.image)}" />`,
			);
			metaTags.push(
				`<meta name="twitter:image" content="${escapeHtml(metadata.image)}" />`,
			);
		}
		if (metadata.ogType) {
			metaTags.push(
				`<meta property="og:type" content="${escapeHtml(metadata.ogType)}" />`,
			);
		}
		if (metadata.twitterCard) {
			metaTags.push(
				`<meta name="twitter:card" content="${escapeHtml(metadata.twitterCard)}" />`,
			);
		}
		if (metadata.additionalMeta) {
			for (const meta of metadata.additionalMeta) {
				if (meta.name) {
					metaTags.push(
						`<meta name="${escapeHtml(meta.name)}" content="${escapeHtml(meta.content)}" />`,
					);
				} else if (meta.property) {
					metaTags.push(
						`<meta property="${escapeHtml(meta.property)}" content="${escapeHtml(meta.content)}" />`,
					);
				}
			}
		}
	}

	const cssLink = cssURL
		? `<link rel="stylesheet" href="${escapeHtml(cssURL)}" />`
		: "";

	return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>${escapeHtml(title)}</title>
	${metaTags.join("\n\t")}
	<style>${css}</style>
	${cssLink}
</head>
<body class="dark">
	${template}
	<script>
window.__BETTER_AUTH_UI__ = ${JSON.stringify(config)};
${hydrate}
BetterAuthUI.autoHydrate();
	</script>
</body>
</html>`;
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

	// Load assets once at startup
	let hydrateJs: string;
	let cssContent: string;

	try {
		hydrateJs = loadHydrate();
		cssContent = loadCSS();
	} catch (error) {
		console.error("Failed to load UI assets:", error);
		return async (_request: Request): Promise<Response> => {
			return new Response("UI assets not found. Run build first.", {
				status: 500,
			});
		};
	}

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

		// Serve hydration JS
		if (pathname === `${assetsPath}/hydrate.js`) {
			return new Response(hydrateJs, {
				headers: {
					"Content-Type": "application/javascript; charset=utf-8",
					"Cache-Control": "public, max-age=31536000, immutable",
				},
			});
		}

		// Serve CSS
		if (pathname === `${assetsPath}/auth.css`) {
			return new Response(cssContent, {
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
		const apiBaseUrl = uiOptions.apiBaseUrl || ctx.baseURL;

		const { embed, args } = parseEmbedParams(url);

		const config: BetterAuthUIConfig = {
			apiBaseUrl,
			appName: ctx.appName,
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
			embed,
			args,
		};

		const defaultTitles: Record<string, string> = {
			"sign-in": `Sign In - ${config.appName}`,
			"sign-up": `Sign Up - ${config.appName}`,
			"forgot-password": `Forgot Password - ${config.appName}`,
			"reset-password": `Reset Password - ${config.appName}`,
			"verify-email": `Verify Email - ${config.appName}`,
			profile: `Profile - ${config.appName}`,
		};

		// Get the template for this page
		const template = getPageTemplate(page as PageName, embed);

		let pageTitle = defaultTitles[page] || config.appName;
		let metadata:
			| {
					title?: string;
					description?: string;
					image?: string;
					ogType?: string;
					twitterCard?: string;
					additionalMeta?: Array<{
						name?: string;
						property?: string;
						content: string;
					}>;
			  }
			| undefined;

		if (uiOptions.metadata && !embed) {
			try {
				metadata = await uiOptions.metadata({ page, path: pathname });
				if (metadata?.title) {
					pageTitle = metadata.title;
				}
			} catch (error) {
				console.warn("Failed to get page metadata:", error);
			}
		}

		const html = buildHtmlPage(
			template,
			config,
			hydrateJs,
			cssContent,
			pageTitle,
			metadata,
			uiOptions.cssURL,
		);

		return new Response(html, {
			headers: {
				"Content-Type": "text/html; charset=utf-8",
				"Cache-Control": "no-store",
				...SECURITY_HEADERS,
			},
		});
	};
}
