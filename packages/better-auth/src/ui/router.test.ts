import type { BetterAuthPlugin } from "@better-auth/core";
import { backgrounds } from "@better-auth/ui";
import { describe, expect, it } from "vitest";
import { authUI } from "../plugins/auth-ui";
import { genericOAuth } from "../plugins/generic-oauth";
import { username } from "../plugins/username";
import { getTestInstance } from "../test-utils/test-instance";

const pagePlugin = {
	id: "test-ui",
	ui: {
		pages: {
			hello: {
				id: "test-ui.hello",
				path: "/hello",
				title: "Hello",
				render() {
					return {
						tag: "main",
						children: ["Hello <Better Auth>"],
					};
				},
			},
		},
	},
} satisfies BetterAuthPlugin;

const capabilityPlugin = {
	id: "capability-plugin",
	ui: {
		capabilities: {
			passkey: {
				id: "passkey",
				enabled: true,
				routes: {
					generateAuthenticateOptions: {
						type: "auth-route",
						path: "/passkey/generate-authenticate-options",
						method: "POST",
					},
					generateRegisterOptions: {
						type: "auth-route",
						path: "/passkey/generate-register-options",
						method: "POST",
					},
					verifyAuthentication: {
						type: "auth-route",
						path: "/passkey/verify-authentication",
						method: "POST",
					},
				},
			},
			"two-factor": {
				id: "two-factor",
				enabled: true,
				metadata: {
					supportsTotp: true,
					supportsOtp: true,
				},
				routes: {
					verifyTotp: {
						type: "auth-route",
						path: "/two-factor/verify-totp",
						method: "POST",
					},
					sendOtp: {
						type: "auth-route",
						path: "/two-factor/send-otp",
						method: "POST",
					},
					enable: {
						type: "auth-route",
						path: "/two-factor/enable",
						method: "POST",
					},
				},
			},
			"last-login-method": {
				id: "last-login-method",
				enabled: true,
				metadata: {
					cookieName: "better-auth.last_used_login_method",
				},
			},
		},
	},
} satisfies BetterAuthPlugin;

const capabilityPagePlugin = {
	id: "capability-page",
	ui: {
		pages: {
			inspect: {
				id: "capability-page.inspect",
				path: "/inspect-capabilities",
				title: "Inspect Capabilities",
				render(ctx) {
					const passkey = ctx.capability("passkey");
					const registerOptions =
						passkey?.routes?.generateRegisterOptions?.type === "auth-route"
							? passkey.routes.generateRegisterOptions.path
							: "";
					return {
						tag: "main",
						children: [
							ctx.hasCapability("passkey") ? "has-passkey" : "missing-passkey",
							ctx.plugins.has("capability-plugin")
								? " has-plugin"
								: " missing-plugin",
							registerOptions,
						],
					};
				},
			},
		},
	},
} satisfies BetterAuthPlugin;

function expectHTMLRedirect(html: string, url: string) {
	expect(html).toContain("&quot;type&quot;:&quot;redirect&quot;");
	expect(html).toContain(`&quot;url&quot;:&quot;${url}&quot;`);
}

describe("ui router", async () => {
	it("renders plugin pages under the default UI base path", async () => {
		const { auth } = await getTestInstance({
			plugins: [pagePlugin],
		});
		const res = await auth.ui.handler(
			new Request("http://localhost:3000/auth/hello"),
		);
		const html = await res.text();
		expect(res.status).toBe(200);
		expect(html).toContain("<title>Hello</title>");
		expect(html).toContain("Hello &lt;Better Auth&gt;");
	});

	it("supports custom UI base paths", async () => {
		const { auth } = await getTestInstance({
			ui: {
				basePath: "/account",
			},
			plugins: [pagePlugin],
		});
		expect(auth.ui.basePath).toBe("/account");
		const res = await auth.ui.handler(
			new Request("http://localhost:3000/account/hello"),
		);
		expect(res.status).toBe(200);
	});

	it("does not render a background layer for blank backgrounds", async () => {
		const { auth } = await getTestInstance({
			ui: {
				background: backgrounds.blank,
			},
			plugins: [pagePlugin],
		});
		const res = await auth.ui.handler(
			new Request("http://localhost:3000/auth/hello"),
		);
		const html = await res.text();
		expect(html).not.toContain('class="ba-ui-background"');
		expect(html).toContain('class="ba-ui-root"');
		expect(html).toContain("Hello &lt;Better Auth&gt;");
	});

	it("renders configured UI backgrounds behind the foreground root", async () => {
		const { auth } = await getTestInstance({
			ui: {
				background: backgrounds.squaredGrid,
			},
			plugins: [pagePlugin],
		});
		const res = await auth.ui.handler(
			new Request("http://localhost:3000/auth/hello"),
		);
		const html = await res.text();
		const backgroundIndex = html.indexOf('class="ba-ui-background"');
		const rootIndex = html.indexOf('class="ba-ui-root"');
		expect(backgroundIndex).toBeGreaterThan(-1);
		expect(rootIndex).toBeGreaterThan(backgroundIndex);
		expect(html).toContain('data-ba-background="squared-grid"');
		expect(html).toContain("background-size:3.5rem 3.5rem");
		expect(html).toContain("radial-gradient(circle at center");
		expect(html).toContain("color-mix(in srgb,currentColor 50%,transparent)");
		expect(html).toContain(".ba-ui-background{position:fixed");
	});

	it("returns not found for unknown UI pages", async () => {
		const { auth } = await getTestInstance();
		const res = await auth.ui.handler(
			new Request("http://localhost:3000/auth/missing"),
		);
		expect(res.status).toBe(404);
	});

	it("enhances UI forms with the client runtime", async () => {
		const { auth } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
			},
		});
		const res = await auth.ui.handler(
			new Request("http://localhost:3000/auth/sign-in"),
		);
		const html = await res.text();
		expect(html).toContain("data-ba-enhanced");
		expect(html).toContain('data-ba-action-kind="auth-route"');
		expect(html).toContain('action="/sign-in/email"');
		expect(html).toContain('src="/auth/_ba/runtime.js"');
		expect(html).toContain('data-ba-api-base="http://localhost:3000/api/auth"');
		expect(html).toContain("Signed in successfully.");
		expect(html).toContain(".ba-field-error");
		expect(html).toContain('[aria-invalid="true"]');
		expect(html).toContain(".ba-auth-providers .ba-button:hover");
	});

	it("redirects auth UI forms to root by default", async () => {
		const { auth } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
			},
		});
		const res = await auth.ui.handler(
			new Request("http://localhost:3000/auth/sign-up"),
		);
		const html = await res.text();

		expectHTMLRedirect(html, "/");
	});

	it("uses redirectTo query params for auth UI redirects and provider callbacks", async () => {
		const { auth } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
			},
			socialProviders: {
				google: {
					clientId: "test-client-id",
					clientSecret: "test-client-secret",
				},
			},
			plugins: [authUI()],
		});
		const res = await auth.ui.handler(
			new Request("http://localhost:3000/auth/sign-up?redirectTo=/dashboard"),
		);
		const html = await res.text();

		expectHTMLRedirect(html, "/dashboard");
		expect(html).toContain('name="callbackURL" value="/dashboard"');
	});

	it("supports callbackURL query params for auth UI redirects", async () => {
		const { auth } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
			},
			plugins: [authUI()],
		});
		const res = await auth.ui.handler(
			new Request("http://localhost:3000/auth/sign-in?callbackURL=/legacy"),
		);
		const html = await res.text();

		expectHTMLRedirect(html, "/legacy");
	});

	it("uses configured default UI redirects when no query override is present", async () => {
		const { auth } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
			},
			ui: {
				defaultRedirectTo: "/app",
			},
			plugins: [authUI()],
		});
		const res = await auth.ui.handler(
			new Request("http://localhost:3000/auth/sign-in"),
		);
		const html = await res.text();

		expectHTMLRedirect(html, "/app");
	});

	it("ignores untrusted auth UI redirect query params", async () => {
		const { auth } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
			},
			ui: {
				defaultRedirectTo: "/safe",
			},
			plugins: [authUI()],
		});
		const res = await auth.ui.handler(
			new Request(
				"http://localhost:3000/auth/sign-in?redirectTo=https://evil.example",
			),
		);
		const html = await res.text();

		expectHTMLRedirect(html, "/safe");
		expect(html).not.toContain("https://evil.example");
	});

	it("renders auth UI branding and system-aware theme styles", async () => {
		const { auth } = await getTestInstance({
			appName: "Multinite",
			emailAndPassword: {
				enabled: true,
			},
			ui: {
				theme: {
					logoUrl: "https://example.com/logo.svg",
					primary: "#6d5dfc",
				},
			},
			plugins: [authUI()],
		});
		const res = await auth.ui.handler(
			new Request("http://localhost:3000/auth/sign-in"),
		);
		const html = await res.text();

		expect(html).toContain("Multinite");
		expect(html).toContain("<title>Sign In - Multinite</title>");
		expect(html).toContain('class="ba-auth-brand" href="/"');
		expect(html).toContain('aria-label="Multinite home"');
		expect(html).toContain(
			'<link rel="icon" href="https://example.com/logo.svg">',
		);
		expect(html).toContain('src="https://example.com/logo.svg"');
		expect(html).toContain('alt="Multinite logo"');
		expect(html).toContain('draggable="false"');
		expect(html).toContain('data-size="small"');
		expect(html).toContain('data-ba-theme-mode="system"');
		expect(html).not.toContain("data-ba-theme-toggle");
		expect(html).toContain("@media (prefers-color-scheme:dark)");
		expect(html).toContain("--ba-primary:#6d5dfc");
		expect(html).toContain("cursor:pointer;user-select:none");
	});

	it("renders auth UI branding above the card by default", async () => {
		const { auth } = await getTestInstance({
			appName: "Multinite",
			emailAndPassword: {
				enabled: true,
			},
			ui: {
				theme: {
					logoUrl: "https://example.com/logo.svg",
				},
			},
			plugins: [authUI()],
		});
		const res = await auth.ui.handler(
			new Request("http://localhost:3000/auth/sign-in"),
		);
		const html = await res.text();
		const body = html.slice(html.indexOf("<body>"));
		const cardIndex = body.indexOf("ba-auth-card");
		const brandIndex = body.indexOf("ba-auth-brand-position-top-center");

		expect(cardIndex).toBeGreaterThan(-1);
		expect(brandIndex).toBeGreaterThan(-1);
		expect(cardIndex).toBeGreaterThan(brandIndex);
		expect(body).toContain("ba-auth-brand-position-top-center");
	});

	it("supports top-center auth UI branding", async () => {
		const { auth } = await getTestInstance({
			appName: "Multinite",
			emailAndPassword: {
				enabled: true,
			},
			ui: {
				theme: {
					logoUrl: "https://example.com/logo.svg",
					logoPlacement: "top-center",
				},
			},
			plugins: [authUI()],
		});
		const res = await auth.ui.handler(
			new Request("http://localhost:3000/auth/sign-in"),
		);
		const html = await res.text();
		const body = html.slice(html.indexOf("<body>"));
		const cardIndex = body.indexOf("ba-auth-card");
		const brandIndex = body.indexOf("ba-auth-brand-position-top-center");

		expect(brandIndex).toBeGreaterThan(-1);
		expect(cardIndex).toBeGreaterThan(brandIndex);
	});

	it("can hide auth UI branding", async () => {
		const { auth } = await getTestInstance({
			appName: "Multinite",
			emailAndPassword: {
				enabled: true,
			},
			ui: {
				theme: {
					logoUrl: "https://example.com/logo.svg",
					logoPlacement: "hidden",
				},
			},
			plugins: [authUI()],
		});
		const res = await auth.ui.handler(
			new Request("http://localhost:3000/auth/sign-in"),
		);
		const html = await res.text();
		const body = html.slice(html.indexOf("<body>"));

		expect(body).not.toContain("ba-auth-brand-position-");
		expect(body).not.toContain('src="https://example.com/logo.svg"');
	});

	it("supports bottom-left auth UI branding", async () => {
		const { auth } = await getTestInstance({
			appName: "Multinite",
			emailAndPassword: {
				enabled: true,
			},
			ui: {
				theme: {
					logoUrl: "https://example.com/logo.svg",
					logoPlacement: "bottom-left",
				},
			},
			plugins: [authUI()],
		});
		const res = await auth.ui.handler(
			new Request("http://localhost:3000/auth/sign-in"),
		);
		const html = await res.text();
		const body = html.slice(html.indexOf("<body>"));

		expect(body).toContain("ba-auth-brand-position-bottom-left");
		expect(html).toContain(
			".ba-auth-brand-position-bottom-left{bottom:2rem;left:2rem;justify-content:flex-start}",
		);
	});

	it("applies theme border radius to auth UI containers", async () => {
		const { auth } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
			},
			ui: {
				theme: {
					borderRadius: "none",
				},
			},
			plugins: [authUI()],
		});
		const res = await auth.ui.handler(
			new Request("http://localhost:3000/auth/sign-in"),
		);
		const html = await res.text();

		expect(html).toContain("--ba-radius:0");
		expect(html).toContain(".ba-card");
		expect(html).toContain("border-radius:var(--ba-radius)");
		expect(html).not.toContain("border-radius:1.5rem");
		expect(html).not.toContain("border-radius:calc(var(--ba-radius) + .5rem)");
	});

	it("renders theme-specific auth UI logos", async () => {
		const { auth } = await getTestInstance({
			appName: "Multinite",
			emailAndPassword: {
				enabled: true,
			},
			ui: {
				theme: {
					logoUrl: {
						dark: "https://example.com/logo-dark.svg",
						light: "https://example.com/logo-light.svg",
					},
				},
			},
			plugins: [authUI()],
		});
		const res = await auth.ui.handler(
			new Request("http://localhost:3000/auth/sign-in"),
		);
		const html = await res.text();

		expect(html).toContain("<picture>");
		expect(html).toContain('media="(prefers-color-scheme: dark)"');
		expect(html).toContain('srcset="https://example.com/logo-dark.svg"');
		expect(html).toContain('src="https://example.com/logo-light.svg"');
		expect(html).toContain(
			'<link rel="icon" media="(prefers-color-scheme: light)" href="https://example.com/logo-light.svg">',
		);
		expect(html).toContain(
			'<link rel="icon" media="(prefers-color-scheme: dark)" href="https://example.com/logo-dark.svg">',
		);
		expect(html).toContain('alt="Multinite logo"');
	});

	it("renders passkey and social provider sign-in buttons", async () => {
		const { auth } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
			},
			socialProviders: {
				google: {
					clientId: "test-client-id",
					clientSecret: "test-client-secret",
				},
			},
			plugins: [capabilityPlugin, authUI()],
		});
		const res = await auth.ui.handler(
			new Request("http://localhost:3000/auth/sign-in"),
		);
		const html = await res.text();
		const body = html.slice(html.indexOf("<body>"));

		expect(html).toContain("Sign in with Passkey");
		expect(html).toContain("data-ba-passkey-auth");
		expect(html).toContain(
			'data-ba-passkey-verify="/passkey/verify-authentication"',
		);
		expect(html).toContain('class="ba-form ba-provider-form ba-passkey-form"');
		expect(html).toContain(
			'class="ba-button ba-button-secondary ba-button-full"',
		);
		expect(body.indexOf("Continue")).toBeLessThan(
			body.indexOf("Sign in with Passkey"),
		);
		expect(body.indexOf("Sign in with Passkey")).toBeLessThan(
			body.indexOf("ba-auth-divider"),
		);
		expect(html).toContain('action="/sign-in/social"');
		expect(html).toContain('name="provider" value="google"');
		expect(html).toContain("Google");
	});

	it("renders generic OAuth provider buttons through UI capabilities", async () => {
		const { auth } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
			},
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "steam",
							clientId: "test-client-id",
							clientSecret: "test-client-secret",
							authorizationUrl: "https://steam.example.com/oauth/authorize",
							tokenUrl: "https://steam.example.com/oauth/token",
						},
					],
				}),
				authUI(),
			],
		});
		const res = await auth.ui.handler(
			new Request("http://localhost:3000/auth/sign-in"),
		);
		const html = await res.text();

		expect(html).toContain('action="/sign-in/oauth2"');
		expect(html).toContain('name="providerId" value="steam"');
		expect(html).toContain("Steam");
	});

	it("exposes plugin capabilities on UI context", async () => {
		const { auth } = await getTestInstance({
			plugins: [capabilityPlugin, capabilityPagePlugin],
		});
		const res = await auth.ui.handler(
			new Request("http://localhost:3000/auth/inspect-capabilities"),
		);
		const html = await res.text();
		expect(html).toContain("has-passkey");
		expect(html).toContain("has-plugin");
		expect(html).toContain("/passkey/generate-register-options");
	});

	it("renders known first-party capability UI from auth pages", async () => {
		const { auth } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
			},
			plugins: [capabilityPlugin, authUI()],
		});
		const res = await auth.ui.handler(
			new Request("http://localhost:3000/auth/sign-up", {
				headers: {
					cookie: "better-auth.last_used_login_method=passkey",
				},
			}),
		);
		const html = await res.text();
		expect(html).toContain("Last used sign-in method: passkey.");
		expect(html).toContain('<div id="passkey-registration"');
		expect(html).toContain('data-ba-dialog-close="passkey-registration"');
		expect(html).toContain("Add passkey");
		expect(html).toContain("&quot;type&quot;:&quot;openDialog&quot;");
		expect(html).toContain(
			"&quot;target&quot;:&quot;passkey-registration&quot;",
		);
		expect(html).toContain('class="ba-button ba-button-secondary"');
		expect(html).toContain("Skip for now");
		expect(html).toContain('<div id="two-factor-enrollment"');
		expect(html).toContain('class="ba-modal"');
		expect(html).toContain('class="ba-modal-panel"');
		expect(html).toContain('data-ba-dialog-close="two-factor-enrollment"');
		expect(html).toContain("Set up two-factor");
	});

	it("opens two-factor enrollment as a dialog after sign up", async () => {
		const twoFactorPlugin = {
			id: "two-factor-fixture",
			ui: {
				capabilities: {
					"two-factor": capabilityPlugin.ui.capabilities["two-factor"],
				},
			},
		} satisfies BetterAuthPlugin;
		const { auth } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
			},
			plugins: [twoFactorPlugin, authUI()],
		});
		const res = await auth.ui.handler(
			new Request("http://localhost:3000/auth/sign-up"),
		);
		const html = await res.text();

		expect(html).toContain('<div id="two-factor-enrollment"');
		expect(html).toContain("&quot;type&quot;:&quot;openDialog&quot;");
		expect(html).toContain(
			"&quot;target&quot;:&quot;two-factor-enrollment&quot;",
		);
	});

	it("renders username plugin fields on sign up", async () => {
		const { auth } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
			},
			plugins: [
				username({
					minUsernameLength: 5,
					maxUsernameLength: 20,
				}),
				authUI(),
			],
		});
		const res = await auth.ui.handler(
			new Request("http://localhost:3000/auth/sign-up"),
		);
		const html = await res.text();

		expect(html).toContain('name="username"');
		expect(html).toContain("Username");
		expect(html).toContain('minlength="5"');
		expect(html).toContain('maxlength="20"');
		expect(html).toContain('name="displayUsername"');
		expect(html).toContain("Display name");
		expect(html).toContain('action="/sign-up/email"');
	});

	it("renders input-enabled additional user fields on sign up", async () => {
		const { auth } = await getTestInstance(
			{
				emailAndPassword: {
					enabled: true,
				},
				user: {
					additionalFields: {
						age: {
							type: "number",
							required: true,
							input: true,
						},
						internalCode: {
							type: "string",
							input: false,
						},
					},
				},
				plugins: [authUI()],
			},
			{
				disableTestUser: true,
			},
		);
		const res = await auth.ui.handler(
			new Request("http://localhost:3000/auth/sign-up"),
		);
		const html = await res.text();

		expect(html).toContain("Age");
		expect(html).toContain('name="age"');
		expect(html).toContain('type="number"');
		expect(html).toContain("required");
		expect(html).not.toContain("internalCode");
	});

	it("renders a dedicated username sign-in page", async () => {
		const { auth } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
			},
			plugins: [username(), authUI()],
		});
		const signInRes = await auth.ui.handler(
			new Request("http://localhost:3000/auth/sign-in"),
		);
		const signInHTML = await signInRes.text();
		expect(signInHTML).toContain('href="./sign-in/username"');

		const usernameRes = await auth.ui.handler(
			new Request("http://localhost:3000/auth/sign-in/username"),
		);
		const usernameHTML = await usernameRes.text();
		expect(usernameHTML).toContain("Sign in with username");
		expect(usernameHTML).toContain('action="/sign-in/username"');
		expect(usernameHTML).toContain('name="username"');
		expect(usernameHTML).toContain('autocomplete="username"');
		expect(usernameHTML).toContain('href="../sign-in"');
	});

	it("serves runtime support for staged UI effects", async () => {
		const { auth } = await getTestInstance();
		const res = await auth.ui.handler(
			new Request("http://localhost:3000/auth/_ba/runtime.js"),
		);
		const js = await res.text();
		expect(js).toContain("form.noValidate = true");
		expect(js).toContain("function validateForm(form)");
		expect(js).toContain("function getValidationMessage(control)");
		expect(js).toContain("Must be at least ");
		expect(js).toContain("Must be at most ");
		expect(js).toContain("function setFieldError(input, message)");
		expect(js).toContain("function clearFieldErrors(form)");
		expect(js).toContain('effect.type === "show"');
		expect(js).toContain('effect.type === "hide"');
		expect(js).toContain('effect.type === "openDialog"');
		expect(js).toContain('effect.type === "closeDialog"');
		// Dialogs are plain z-index overlays (not native <dialog>/showModal), so
		// extension UIs like 1Password's passkey picker can layer above them.
		expect(js).not.toContain("showModal");
		expect(js).toContain("function openDialog(target)");
		expect(js).toContain("dialog.hidden = false");
		expect(js).toContain("dialog.hidden = true");
		expect(js).toContain('event.key !== "Escape"');
		// Toasts must live in the top layer (above modal dialogs), so the
		// region is rendered as a popover and re-promoted on each toast.
		expect(js).toContain('toastRegion.setAttribute("popover", "manual")');
		expect(js).toContain("function promoteToastRegion(region)");
		expect(js).toContain("region.showPopover()");
		expect(js).toContain("[data-ba-dialog-close]");
		expect(js).toContain("better-auth:two-factor-required");
		expect(js).toContain('if (!contentType.includes("json")) return null;');
		expect(js).toContain('if (typeof payload === "string") return fallback;');
		expect(js).not.toContain('setFormStatus(form, "success"');
		// Passkey ceremony is bundled in via @simplewebauthn/browser.
		expect(js).toContain("data-ba-passkey-register");
		expect(js).toContain("data-ba-passkey-auth");
	});
});
