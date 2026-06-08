import type { BetterAuthPlugin, UIComponent } from "@better-auth/core";

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
						const unsafeCode = ctx.query.get("error") || "UNKNOWN";
						const code = isValidErrorCode(unsafeCode) ? unsafeCode : "UNKNOWN";
						const description = ctx.query.get("error_description");
						const message = getErrorMessage(code, description);
						const docsURL = `https://better-auth.com/docs/reference/errors/${encodeURIComponent(code)}`;
						return {
							tag: "main",
							props: {
								class: "ba-page",
								style: {
									padding: "1.5rem",
								},
							},
							children: [
								{
									tag: "card",
									props: {
										style: {
											maxWidth: "34rem",
											display: "grid",
											gap: "1.25rem",
										},
									},
									children: [
										{
											tag: "div",
											props: {
												style: {
													display: "grid",
													gap: "0.75rem",
												},
											},
											children: [
												{
													tag: "span",
													props: {
														style: {
															color: "var(--ba-text-secondary)",
															fontSize: "0.8125rem",
															fontWeight: 500,
															fontFamily:
																"ui-monospace, SFMono-Regular, SF Mono, Menlo, Monaco, Consolas, Liberation Mono, monospace",
														},
													},
													children: ["AUTH ERROR"],
												},
												{
													tag: "h1",
													props: {
														style: {
															margin: "0",
															fontSize: "2rem",
															lineHeight: "1.1",
															letterSpacing: "-0.03em",
														},
													},
													children: ["Something Went Wrong"],
												},
												{
													tag: "p",
													props: {
														style: {
															margin: "0",
															color: "var(--ba-text-secondary)",
															lineHeight: "1.6",
														},
													},
													children: [message],
												},
											],
										},
										{
											tag: "section",
											props: {
												style: {
													display: "grid",
													gap: "0.5rem",
													border: "1px solid var(--ba-border)",
													borderRadius: "min(var(--ba-radius), 0.625rem)",
													padding: "1rem",
													background:
														"color-mix(in srgb,var(--ba-background) 78%,var(--ba-surface))",
												},
											},
											children: [
												{
													tag: "span",
													props: {
														style: {
															color: "var(--ba-text-secondary)",
															fontSize: "0.8125rem",
															fontWeight: 600,
															textTransform: "uppercase",
															letterSpacing: "0.08em",
														},
													},
													children: ["Error code"],
												},
												{
													tag: "code",
													props: {
														style: {
															fontFamily:
																"ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace",
															fontSize: "0.95rem",
															wordBreak: "break-word",
														},
													},
													children: [code],
												},
											],
										},
										{
											tag: "p",
											props: {
												style: {
													margin: "0",
													color: "var(--ba-text-secondary)",
													fontSize: "0.875rem",
													lineHeight: "1.5",
												},
											},
											children: [
												"If this keeps happening, check your auth server logs and compare this code with the Better Auth error reference.",
											],
										},
										{
											tag: "div",
											props: {
												style: {
													display: "flex",
													gap: "0.75rem",
													flexWrap: "wrap",
												},
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
								},
							],
						} satisfies UIComponent;
					},
				},
			},
		},
	}) satisfies BetterAuthPlugin;
