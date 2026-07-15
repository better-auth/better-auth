import type {
	BetterAuthPlugin,
	ThemeConfig,
	UIComponent,
	UIContext,
} from "@better-auth/core";

function isValidErrorCode(code: string) {
	return /^[\'A-Za-z0-9_-]+$/.test(code);
}

function formatErrorCode(code: string) {
	return code.replace(/[_-]+/g, " ").toLowerCase();
}

function getErrorMessage(code: string, description: string | null) {
	if (description) return description;
	if (code === "UNKNOWN") {
		return "We could not determine exactly what happened. Please try again or return to a safe page.";
	}
	return `We could not complete the auth request because of ${formatErrorCode(code)}. Please try again or return to a safe page.`;
}

function brandBlock(theme: ThemeConfig): UIComponent | null {
	const appName = theme.appName;
	if (!appName) return null;
	const logoUrl = theme.logoUrl;
	const logo =
		typeof logoUrl === "string"
			? { src: logoUrl }
			: {
					src: logoUrl?.light,
					dark: logoUrl?.dark,
				};
	const placement = theme.logoPlacement ?? "top-center";
	if (placement === "hidden") return null;
	const logoChildren: UIComponent[] = [];
	if (logo.src) {
		if (logo.dark) {
			logoChildren.push({
				tag: "picture",
				children: [
					{
						tag: "source",
						props: {
							media: "(prefers-color-scheme: dark)",
							srcset: logo.dark,
						},
					},
					{
						tag: "img",
						props: {
							src: logo.src,
							alt: `${appName} logo`,
							draggable: "false",
						},
					},
				],
			});
		} else {
			logoChildren.push({
				tag: "img",
				props: {
					src: logo.src,
					alt: `${appName} logo`,
					draggable: "false",
				},
			});
		}
	}
	return {
		tag: "div",
		props: {
			class: `ba-auth-brand-placement ba-auth-brand-position-${placement}`,
		},
		children: [
			{
				tag: "a",
				props: {
					class: "ba-auth-brand",
					href: "/",
					"aria-label": `${appName} home`,
				},
				children: [
					...(logoChildren.length > 0
						? [
								{
									tag: "span",
									props: {
										class: "ba-auth-logo",
										"data-size": "small",
									},
									children: logoChildren,
								} satisfies UIComponent,
							]
						: []),
					{
						tag: "span",
						children: [appName],
					},
				],
			},
		],
	};
}

function buildErrorPage(ctx: UIContext): UIComponent {
	const unsafeCode = ctx.query.get("error") || "UNKNOWN";
	const code = isValidErrorCode(unsafeCode) ? unsafeCode : "UNKNOWN";
	const description = ctx.query.get("error_description");
	const message = getErrorMessage(code, description);
	const docsURL = `https://better-auth.com/docs/reference/errors/${encodeURIComponent(code)}`;

	const brand = brandBlock(ctx.theme);
	const placement = ctx.theme.logoPlacement ?? "top-center";
	const brandBefore = placement.startsWith("top-") ? brand : null;
	const brandAfter = placement.startsWith("bottom-") ? brand : null;

	const card: UIComponent = {
		tag: "card",
		props: {
			class: "ba-auth-card ba-auth-error-card",
		},
		children: [
			{
				tag: "header",
				props: {
					class: "ba-auth-header",
					"data-align": "start",
				},
				children: [
					{
						tag: "span",
						props: {
							class: "ba-auth-eyebrow",
						},
						children: ["Auth Error"],
					},
					{
						tag: "h1",
						props: {
							class: "ba-auth-title",
						},
						children: ["Something Went Wrong"],
					},
					{
						tag: "p",
						props: {
							class: "ba-auth-description",
						},
						children: [message],
					},
				],
			},
			{
				tag: "section",
				props: {
					class: "ba-auth-error-code",
				},
				children: [
					{
						tag: "span",
						props: {
							class: "ba-auth-error-code-label",
						},
						children: ["Error code"],
					},
					{
						tag: "code",
						props: {
							class: "ba-auth-error-code-value",
						},
						children: [code],
					},
				],
			},
			{
				tag: "p",
				props: {
					class: "ba-auth-description",
				},
				children: [
					"If this keeps happening, check your auth server logs and compare this code with the Better Auth error reference.",
				],
			},
			{
				tag: "div",
				props: {
					class: "ba-auth-error-actions",
				},
				children: [
					{
						tag: "a",
						props: {
							class: "ba-button",
							href: "./sign-in",
						},
						children: ["Try again"],
					},
					{
						tag: "a",
						props: {
							class: "ba-button ba-button-outline",
							href: "/",
						},
						children: ["Go home"],
					},
					{
						tag: "a",
						props: {
							class: "ba-button ba-button-outline",
							href: `${docsURL}?askai=${encodeURIComponent(`What does the error code ${code} mean?`)}`,
							target: "_blank",
							rel: "noopener noreferrer",
						},
						children: ["Open Error Reference"],
					},
				],
			},
		],
	};

	return {
		tag: "main",
		props: {
			class: "ba-auth-page",
		},
		children: [brandBefore, card, brandAfter],
	};
}

export const authErrorUI = () =>
	({
		id: "auth-error-ui",
		ui: {
			pages: {
				error: {
					id: "auth-error-ui.error",
					path: "/error",
					title: "Auth Error",
					render(ctx) {
						return buildErrorPage(ctx);
					},
				},
			},
		},
	}) satisfies BetterAuthPlugin;
