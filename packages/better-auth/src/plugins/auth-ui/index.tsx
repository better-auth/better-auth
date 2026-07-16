/** @jsxImportSource @better-auth/ui */

import type {
	BetterAuthPlugin,
	UIContext,
	UIPage,
	UIPluginCapability,
} from "@better-auth/core";
import type { DBFieldAttribute } from "@better-auth/core/db";
import type { UIChild } from "@better-auth/ui";
import {
	Button,
	Card,
	createUIPage,
	Dialog,
	effects,
	Form,
	Input,
	Link,
	routes,
	Show,
	state,
	Text,
	when,
} from "@better-auth/ui";
import { getSafeUIRedirectTo, getUIBasePath } from "../../ui";
import { PACKAGE_VERSION } from "../../version";
import { hasActiveUISession, uiRedirect } from "./session";
import { createSettingsPages } from "./settings";
import { KNOWN_PROVIDER_ICONS } from "./social-provider-icons";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"auth-ui": {
			creator: typeof authUI;
		};
	}
}

type AuthUIOptions = {
	disableSignUp?: boolean | undefined;
	pages?: Partial<
		Record<
			| "index"
			| "signIn"
			| "signInUsername"
			| "signInPhone"
			| "signUp"
			| "forgotPassword"
			| "resetPassword"
			| "verifyEmail"
			| "settings"
			| "settingsProfile"
			| "settingsPassword"
			| "settingsEmail"
			| "settingsAccounts"
			| "settingsPasskeys"
			| "settingsTwoFactor",
			UIPage
		>
	>;
};

type AuthProvider = {
	id: string;
	label: string;
	route: "social" | "oauth2";
};

function uiHref(ctx: UIContext, path: string) {
	const base = getUIBasePath(ctx.context.options);
	const normalized = path.startsWith("/") ? path : `/${path}`;
	return `${base}${normalized}`;
}

function readCookie(request: Request, name: string) {
	const header = request.headers.get("cookie");
	if (!header) return null;
	for (const pair of header.split(";")) {
		const [key, ...value] = pair.trim().split("=");
		if (key === name) return decodeURIComponent(value.join("="));
	}
	return null;
}

function getRedirectTo(ctx: UIContext) {
	return getSafeUIRedirectTo(ctx);
}

function isSignUpDisabled(ctx: UIContext, options?: AuthUIOptions | undefined) {
	return Boolean(
		options?.disableSignUp ||
			ctx.context.options.emailAndPassword?.disableSignUp,
	);
}

function getNumberMetadata(
	capability: UIPluginCapability | null,
	key: string,
	fallback: number,
) {
	const value = capability?.metadata?.[key];
	return typeof value === "number" ? value : fallback;
}

function supportsDisplayUsername(capability: UIPluginCapability | null) {
	return capability?.metadata?.supportsDisplayUsername !== false;
}

function formatFieldLabel(key: string) {
	return key
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[-_]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^./, (char) => char.toUpperCase());
}

function inputTypeForField(field: DBFieldAttribute) {
	if (field.type === "number") return "number";
	if (field.type === "boolean") return "checkbox";
	if (field.type === "date") return "date";
	if (field.type === "string") return "text";
	return null;
}

function renderAdditionalUserFields(ctx: UIContext) {
	const fields = ctx.context.options.user?.additionalFields ?? {};
	return Object.entries(fields)
		.map(([name, field]) => {
			if (field.input === false) return null;
			const type = inputTypeForField(field);
			if (!type) return null;
			return (
				<Input
					name={name}
					label={formatFieldLabel(name)}
					type={type}
					required={
						field.required !== false && field.defaultValue === undefined
					}
				/>
			);
		})
		.filter(Boolean);
}

function formatProviderLabel(id: string, name?: string | undefined) {
	if (name && name !== id) return name;
	return id
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function providerInitials(label: string) {
	return label.charAt(0).toUpperCase();
}

function isThemeProviderIcon(
	icon: unknown,
): icon is { dark?: UIChild | undefined; light?: UIChild | undefined } {
	return (
		!!icon && typeof icon === "object" && ("dark" in icon || "light" in icon)
	);
}

function isRenderableProviderIcon(icon: unknown): icon is UIChild {
	if (icon === null || icon === undefined) return false;
	if (typeof icon !== "object") return true;
	if (Array.isArray(icon)) return true;
	return "tag" in icon;
}

function resolveProviderIcon(icon: unknown, fallback: string) {
	return isRenderableProviderIcon(icon) ? icon : fallback;
}

function providerIcon(provider: AuthProvider, ctx: UIContext): UIChild {
	const icon =
		KNOWN_PROVIDER_ICONS[
			provider.id.toLowerCase() as keyof typeof KNOWN_PROVIDER_ICONS
		];
	if (!isThemeProviderIcon(icon)) {
		return resolveProviderIcon(icon, providerInitials(provider.label));
	}
	if (
		isRenderableProviderIcon(icon.dark) &&
		isRenderableProviderIcon(icon.light)
	) {
		return (
			<>
				<span class="ba-provider-icon-light">{icon.light}</span>
				<span class="ba-provider-icon-dark">{icon.dark}</span>
			</>
		);
	}
	return resolveProviderIcon(
		icon.light ?? icon.dark,
		providerInitials(provider.label),
	);
}

function getAuthProviders(ctx: UIContext): AuthProvider[] {
	const providers = new Map<string, AuthProvider>();
	const genericOAuth = ctx.capability("generic-oauth");
	const genericProviders = genericOAuth?.metadata?.providers;
	if (Array.isArray(genericProviders)) {
		for (const item of genericProviders) {
			if (!item || typeof item !== "object" || Array.isArray(item)) continue;
			const id = item.id;
			if (typeof id !== "string" || providers.has(id)) continue;
			providers.set(id, {
				id,
				label:
					typeof item.name === "string"
						? formatProviderLabel(id, item.name)
						: formatProviderLabel(id),
				route: "oauth2",
			});
		}
	}
	for (const provider of ctx.context.socialProviders) {
		if (providers.has(provider.id)) continue;
		providers.set(provider.id, {
			id: provider.id,
			label: formatProviderLabel(provider.id, provider.name),
			route: "social",
		});
	}
	return [...providers.values()];
}

function AppBrand(props: { ctx: UIContext }) {
	const appName = props.ctx.theme.appName ?? props.ctx.context.appName;
	const logoURL = props.ctx.theme.logoURL;
	const logo =
		typeof logoURL === "string"
			? { src: logoURL }
			: {
					src: logoURL?.light,
					dark: logoURL?.dark,
				};
	return (
		<a class="ba-auth-brand" href="/" aria-label={`${appName} home`}>
			{logo.src ? (
				<span class="ba-auth-logo" data-size="small">
					{logo.dark ? (
						<picture>
							<source media="(prefers-color-scheme: dark)" srcset={logo.dark} />
							<img src={logo.src} alt={`${appName} logo`} draggable="false" />
						</picture>
					) : (
						<img src={logo.src} alt={`${appName} logo`} draggable="false" />
					)}
				</span>
			) : null}
			<span>{appName}</span>
		</a>
	);
}

function AuthLegalNotice(props: {
	ctx: UIContext;
	action: "signing in" | "signing up";
}) {
	const { t } = props.ctx;
	const termsOfServiceURL = props.ctx.context.options.ui?.termsOfServiceURL;
	const privacyPolicyURL = props.ctx.context.options.ui?.privacyPolicyURL;
	if (!termsOfServiceURL && !privacyPolicyURL) return <></>;

	const byAction =
		props.action === "signing up"
			? t("legal.bySigningUp")
			: t("legal.bySigningIn");

	const termsLink = termsOfServiceURL ? (
		<Link href={termsOfServiceURL} target="_blank" rel="noopener noreferrer">
			{t("legal.termsOfService")}
		</Link>
	) : null;
	const privacyLink = privacyPolicyURL ? (
		<Link href={privacyPolicyURL} target="_blank" rel="noopener noreferrer">
			{t("legal.privacyPolicy")}
		</Link>
	) : null;

	const notice =
		termsLink && privacyLink ? (
			<>
				{byAction} {termsLink} {t("legal.and")} {privacyLink}.
			</>
		) : termsLink ? (
			<>
				{byAction} {termsLink}.
			</>
		) : (
			<>
				{byAction} {privacyLink}.
			</>
		);

	return (
		<div class="ba-auth-legal">
			<p class="ba-auth-legal-text">{notice}</p>
		</div>
	);
}

function PasswordField(props: {
	ctx: UIContext;
	name: string;
	autocomplete: string;
	placeholder: string;
	forgotPasswordHref?: string | undefined;
}) {
	const { t } = props.ctx;
	return (
		<div class="ba-field">
			<div class="ba-field-label-row">
				<span class="ba-field-label">{t("field.password")}</span>
				{props.forgotPasswordHref ? (
					<Link href={props.forgotPasswordHref} class="ba-field-label-action">
						{t("action.forgotPassword")}
					</Link>
				) : null}
			</div>
			<div class="ba-input-affix">
				<Input
					name={props.name}
					type="password"
					autocomplete={props.autocomplete}
					placeholder={props.placeholder}
					required
				/>
				<button
					type="button"
					class="ba-password-toggle"
					data-ba-toggle-password
					data-ba-unstyled
					aria-label="Show password"
				>
					<svg
						class="ba-password-icon-show"
						xmlns="http://www.w3.org/2000/svg"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"></path>
						<circle cx="12" cy="12" r="3"></circle>
					</svg>
					<svg
						class="ba-password-icon-hide"
						xmlns="http://www.w3.org/2000/svg"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"></path>
						<path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"></path>
						<path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-4.86"></path>
						<path d="m2 2 20 20"></path>
					</svg>
				</button>
			</div>
		</div>
	);
}

function AuthCard(props: {
	ctx: UIContext;
	title: string;
	description: string;
	footer?: UIChild | undefined;
	tabs?: "sign-in" | "sign-up" | undefined;
	align?: "start" | "center" | undefined;
	legalAction?: "signing in" | "signing up" | undefined;
	children: UIChild;
}) {
	const logoPlacement = props.ctx.theme.logoPlacement ?? "top-center";
	const brand =
		logoPlacement === "hidden" ? null : (
			<div
				class={`ba-auth-brand-placement ba-auth-brand-position-${logoPlacement}`}
			>
				<AppBrand ctx={props.ctx} />
			</div>
		);
	const brandBeforeCard = logoPlacement.startsWith("top-") ? brand : null;
	const brandAfterCard = logoPlacement.startsWith("bottom-") ? brand : null;
	const showTabs = Boolean(props.tabs);
	const cardClass = showTabs
		? "ba-auth-card ba-auth-card--tabbed"
		: "ba-auth-card";
	const content = (
		<>
			{showTabs ? (
				<nav class="ba-auth-tabs" aria-label="Authentication">
					{props.tabs === "sign-in" ? (
						<span class="ba-auth-tab" aria-current="page">
							{props.ctx.t("tabs.signIn")}
						</span>
					) : (
						<Link href={uiHref(props.ctx, "/sign-in")} class="ba-auth-tab">
							{props.ctx.t("tabs.signIn")}
						</Link>
					)}
					{props.tabs === "sign-up" ? (
						<span class="ba-auth-tab" aria-current="page">
							{props.ctx.t("tabs.signUp")}
						</span>
					) : (
						<Link href={uiHref(props.ctx, "/sign-up")} class="ba-auth-tab">
							{props.ctx.t("tabs.signUp")}
						</Link>
					)}
				</nav>
			) : null}
			<Card class={cardClass}>
				<header
					class="ba-auth-header"
					data-align={props.align ?? (showTabs ? "start" : "center")}
				>
					<h1 class="ba-auth-title">{props.title}</h1>
					<p class="ba-auth-description">{props.description}</p>
				</header>
				{props.children}
				{props.legalAction ? (
					<AuthLegalNotice ctx={props.ctx} action={props.legalAction} />
				) : null}
				{props.footer ? <p class="ba-auth-footer">{props.footer}</p> : null}
			</Card>
		</>
	);

	return (
		<main class="ba-auth-page">
			{brandBeforeCard}
			{showTabs ? <div class="ba-auth-shell">{content}</div> : content}
			{brandAfterCard}
		</main>
	);
}

function AuthCardShim(props: {
	ctx: UIContext;
	title: string;
	description: string;
}) {
	return (
		<main class="ba-auth-page">
			<Card class="ba-auth-card">
				<header class="ba-auth-header" data-align="center">
					<h1 class="ba-auth-title">{props.title}</h1>
					<p class="ba-auth-description">{props.description}</p>
				</header>
				<Link
					href={uiHref(props.ctx, "/sign-in")}
					class="ba-button ba-button-full"
				>
					{props.ctx.t("action.backToSignIn")}
				</Link>
			</Card>
		</main>
	);
}

function CaptchaConfig(props: { ctx: UIContext }) {
	const captcha = props.ctx.capability("captcha");
	if (!captcha) return <></>;
	const provider =
		typeof captcha.metadata?.provider === "string"
			? captcha.metadata.provider
			: "";
	const siteKey =
		typeof captcha.metadata?.siteKey === "string"
			? captcha.metadata.siteKey
			: "";
	const headerName =
		typeof captcha.metadata?.headerName === "string"
			? captcha.metadata.headerName
			: "x-captcha-response";
	const endpoints = Array.isArray(captcha.metadata?.endpoints)
		? JSON.stringify(
				(captcha.metadata.endpoints as unknown[]).filter(
					(value): value is string => typeof value === "string",
				),
			)
		: "[]";
	return (
		<div
			class="ba-captcha"
			data-ba-captcha-widget
			data-ba-captcha-provider={provider}
			data-ba-captcha-sitekey={siteKey}
			data-ba-captcha-header={headerName}
			data-ba-captcha-endpoints={endpoints}
			aria-live="polite"
		/>
	);
}

function ProviderButtons(props: {
	ctx: UIContext;
	mode: "signIn" | "signUp";
	providers: AuthProvider[];
	children?: UIChild;
}) {
	const { t } = props.ctx;
	const redirectTo = getRedirectTo(props.ctx);
	if (props.providers.length === 0 && !props.children) return <></>;
	const stacked = props.providers.length <= 2;
	const prefix =
		props.mode === "signUp"
			? t("provider.signUpWith")
			: t("provider.signInWith");
	return (
		<section
			class="ba-auth-providers"
			data-layout={stacked ? "stack" : "grid"}
			aria-label="Other sign-in methods"
		>
			{props.children}
			{props.providers.map((provider) => (
				<Form
					class="ba-provider-form"
					action={
						provider.route === "oauth2"
							? routes.signIn.oauth2
							: routes.signIn.social
					}
					pending={t("provider.redirecting").replace(
						"{provider}",
						provider.label,
					)}
					error={[
						effects.toastFromError({
							fallback: t("provider.error").replace(
								"{provider}",
								provider.label,
							),
						}),
					]}
				>
					<input
						type="hidden"
						name={provider.route === "oauth2" ? "providerId" : "provider"}
						value={provider.id}
					/>
					<input type="hidden" name="callbackURL" value={redirectTo} />
					{props.mode === "signUp" ? (
						<input
							type="checkbox"
							name="requestSignUp"
							checked
							hidden
							data-ba-unstyled
						/>
					) : null}
					<Button type="submit" class="ba-button-outline">
						<span class="ba-provider-icon">
							{providerIcon(provider, props.ctx)}
						</span>
						{stacked ? `${prefix} ${provider.label}` : provider.label}
					</Button>
				</Form>
			))}
		</section>
	);
}

function PasskeySignInButton(props: { ctx: UIContext }) {
	const { t } = props.ctx;
	const redirectTo = getRedirectTo(props.ctx);
	const passkey = props.ctx.capability("passkey");
	const generateAuthenticateOptions =
		passkey?.routes?.generateAuthenticateOptions;
	const verifyAuthentication = passkey?.routes?.verifyAuthentication;
	const verifyAuthenticationPath =
		verifyAuthentication?.type === "auth-route"
			? verifyAuthentication.path
			: undefined;
	return (
		<Form
			class="ba-provider-form ba-passkey-form"
			action={generateAuthenticateOptions}
			pending={t("passkey.startingSignIn")}
			success={[
				effects.toast({
					level: "success",
					message: t("passkey.signInSuccess"),
				}),
				effects.navigate(redirectTo),
			]}
			error={[
				effects.toastFromError({
					fallback: t("passkey.signInError"),
				}),
			]}
			data-ba-passkey-auth
			data-ba-passkey-verify={verifyAuthenticationPath}
		>
			<Button type="submit" class="ba-button-outline">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"></path>
					<path d="M14 13.12c0 2.38 0 6.38-1 8.88"></path>
					<path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"></path>
					<path d="M2 12a10 10 0 0 1 18-6"></path>
					<path d="M2 16h.01"></path>
					<path d="M21.8 16c.2-2 .131-5.354 0-6"></path>
					<path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"></path>
					<path d="M8.65 22c.21-.66.45-1.32.57-2"></path>
					<path d="M9 6.8a6 6 0 0 1 9 5.2v2"></path>
				</svg>
				{t("passkey.signIn")}
			</Button>
		</Form>
	);
}

function PhoneSignInButton(props: { ctx: UIContext }) {
	const { t } = props.ctx;
	return (
		<div class="ba-provider-form">
			<Link
				href={uiHref(props.ctx, "/sign-in/phone")}
				class="ba-button ba-button-outline"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384" />
				</svg>
				{t("action.signInWithPhone")}
			</Link>
		</div>
	);
}

function AuthDivider(props: { label: string }) {
	return (
		<div class="ba-auth-divider" role="separator">
			{props.label}
		</div>
	);
}

function LastLoginMethodHint(props: {
	ctx: UIContext;
	capability: UIPluginCapability;
}) {
	const { t } = props.ctx;
	const cookieName = props.capability.metadata?.cookieName;
	const lastMethod =
		typeof cookieName === "string"
			? readCookie(props.ctx.request, cookieName)
			: null;
	if (!lastMethod) {
		return <Text>{t("lastLogin.hint")}</Text>;
	}
	return <Text>{t("lastLogin.lastUsed").replace("{method}", lastMethod)}</Text>;
}

function AccountSecurityChooser(props: {
	ctx: UIContext;
	passkey: UIPluginCapability | null;
	twoFactor: UIPluginCapability | null;
	redirectTo: string;
}) {
	const { t } = props.ctx;
	const enableRoute = props.twoFactor?.routes?.enable;
	const supportsTotp =
		props.twoFactor?.metadata?.supportsTotp !== false && Boolean(enableRoute);
	if (!props.passkey && !supportsTotp) return <></>;
	return (
		<>
			<Dialog
				id="account-security"
				title={t("security.chooserTitle")}
				description={t("security.chooserDescription")}
			>
				<div class="ba-security-options ba-dialog-actions">
					{props.passkey ? (
						<button
							type="button"
							class="ba-button ba-button-full"
							data-ba-unstyled
							data-ba-dialog-close="account-security"
							data-ba-open-dialog="passkey-registration"
						>
							{t("security.passkeyOption")}
						</button>
					) : null}
					{supportsTotp && enableRoute ? (
						<Form
							action={enableRoute}
							pending={t("twoFactor.preparingSetup")}
							success={[
								effects.closeDialog("account-security"),
								effects.openDialog("two-factor-setup"),
							]}
							error={[
								effects.toastFromError({
									fallback: t("twoFactor.setupError"),
								}),
							]}
							data-ba-two-factor-enable
						>
							<input type="hidden" name="method" value="totp" />
							<Button type="submit" class="ba-button-full">
								{t("twoFactor.optionLabel")}
							</Button>
						</Form>
					) : null}
					<Link href={props.redirectTo} class="ba-button ba-button-outline">
						{t("security.skip")}
					</Link>
				</div>
			</Dialog>
			<SecuritySuccessDialog
				ctx={props.ctx}
				passkey={props.passkey}
				twoFactor={props.twoFactor}
				redirectTo={props.redirectTo}
			/>
		</>
	);
}

function SecuritySuccessDialog(props: {
	ctx: UIContext;
	passkey: UIPluginCapability | null;
	twoFactor: UIPluginCapability | null;
	redirectTo: string;
}) {
	const { t } = props.ctx;
	const enableRoute = props.twoFactor?.routes?.enable;
	const supportsTotp =
		props.twoFactor?.metadata?.supportsTotp !== false && Boolean(enableRoute);
	const passkeyDone = state("security.passkeyDone");
	const twoFactorDone = state("security.twoFactorDone");
	return (
		<Dialog
			id="security-success"
			title={t("security.successTitle")}
			description={t("security.successDescription")}
		>
			<div class="ba-dialog-actions">
				{supportsTotp && enableRoute ? (
					<Show when={when(passkeyDone, { equals: true })}>
						<Show when={when(twoFactorDone, { not: true })}>
							<Form
								action={enableRoute}
								pending={t("twoFactor.preparingSetup")}
								success={[
									effects.closeDialog("security-success"),
									effects.openDialog("two-factor-setup"),
								]}
								error={[
									effects.toastFromError({
										fallback: t("twoFactor.setupError"),
									}),
								]}
								data-ba-two-factor-enable
							>
								<input type="hidden" name="method" value="totp" />
								<Button type="submit" class="ba-button-full">
									{t("twoFactor.optionLabel")}
								</Button>
							</Form>
						</Show>
					</Show>
				) : null}
				{props.passkey ? (
					<Show when={when(twoFactorDone, { equals: true })}>
						<Show when={when(passkeyDone, { not: true })}>
							<button
								type="button"
								class="ba-button ba-button-full"
								data-ba-unstyled
								data-ba-dialog-close="security-success"
								data-ba-open-dialog="passkey-registration"
							>
								{t("security.passkeyOption")}
							</button>
						</Show>
					</Show>
				) : null}
				<a href={props.redirectTo} class="ba-button ba-button-outline">
					{t("security.continue")}
				</a>
			</div>
		</Dialog>
	);
}

function PasskeyRegistrationPanel(props: {
	ctx: UIContext;
	capability: UIPluginCapability;
}) {
	const { t } = props.ctx;
	const registerRoute = props.capability.routes?.generateRegisterOptions;
	const verifyRegistration = props.capability.routes?.verifyRegistration;
	const verifyRegistrationPath =
		verifyRegistration?.type === "auth-route"
			? verifyRegistration.path
			: undefined;
	return (
		<Dialog
			id="passkey-registration"
			title={t("passkey.addTitle")}
			description={t("passkey.addDescription")}
		>
			<div class="ba-dialog-actions">
				{registerRoute ? (
					<Form
						action={registerRoute}
						pending={t("passkey.startingRegistration")}
						success={[
							effects.set("security.passkeyDone", true),
							effects.toast({
								level: "success",
								message: t("passkey.registered"),
							}),
							effects.closeDialog("passkey-registration"),
							effects.openDialog("security-success"),
						]}
						error={[
							effects.toastFromError({
								fallback: t("passkey.registerError"),
							}),
						]}
						data-ba-passkey-register
						data-ba-passkey-verify={verifyRegistrationPath}
					>
						<Button type="submit" class="ba-button-full">
							{t("passkey.addSubmit")}
						</Button>
					</Form>
				) : null}
				<button
					type="button"
					class="ba-button ba-button-outline"
					data-ba-unstyled
					data-ba-dialog-close="passkey-registration"
					data-ba-open-dialog="account-security"
				>
					{t("security.back")}
				</button>
			</div>
		</Dialog>
	);
}

function TwoFactorEnrollmentPanel(props: {
	ctx: UIContext;
	capability: UIPluginCapability;
}) {
	const { t } = props.ctx;
	const enableRoute = props.capability.routes?.enable;
	const verifyTotpRoute = props.capability.routes?.verifyTotp;
	const supportsTotp = props.capability.metadata?.supportsTotp !== false;
	if (!enableRoute || !supportsTotp) return <></>;
	return (
		<Dialog
			id="two-factor-setup"
			title={t("twoFactor.setupTitle")}
			description={t("twoFactor.setupDescription")}
		>
			<div class="ba-dialog-actions" data-ba-method-scope>
				<div
					class="ba-auth-methods"
					role="tablist"
					aria-label={t("twoFactor.setupTitle")}
				>
					<button
						type="button"
						class="ba-auth-method-btn"
						data-ba-unstyled
						data-ba-method="qr"
						aria-pressed="true"
						role="tab"
					>
						{t("twoFactor.tabQr")}
					</button>
					<button
						type="button"
						class="ba-auth-method-btn"
						data-ba-unstyled
						data-ba-method="backup"
						aria-pressed="false"
						role="tab"
					>
						{t("twoFactor.tabBackupCodes")}
					</button>
				</div>
				<div data-ba-method-panel="qr">
					<div class="ba-totp-qr" data-ba-totp-qr aria-live="polite"></div>
				</div>
				<div data-ba-method-panel="backup" hidden>
					<pre class="ba-backup-codes" data-ba-backup-codes></pre>
					<p class="ba-dialog-description">{t("twoFactor.scanQRCode")}</p>
				</div>
				{verifyTotpRoute ? (
					<Form
						action={verifyTotpRoute}
						pending={t("twoFactor.verifyingAuthenticator")}
						success={[
							effects.set("security.twoFactorDone", true),
							effects.toast({
								level: "success",
								message: t("twoFactor.enabled"),
							}),
							effects.closeDialog("two-factor-setup"),
							effects.openDialog("security-success"),
						]}
						error={[
							effects.toastFromError({
								fallback: t("twoFactor.verifyAuthenticatorError"),
							}),
						]}
					>
						<Input
							name="code"
							label={t("twoFactor.authenticatorCode")}
							autocomplete="one-time-code"
							required
						/>
						<Button type="submit" class="ba-button-full">
							{t("twoFactor.confirmAndContinue")}
						</Button>
					</Form>
				) : null}
				<button
					type="button"
					class="ba-button ba-button-outline"
					data-ba-unstyled
					data-ba-dialog-close="two-factor-setup"
					data-ba-open-dialog="account-security"
				>
					{t("security.back")}
				</button>
			</div>
		</Dialog>
	);
}

function TwoFactorChallengePanel(props: {
	ctx: UIContext;
	capability: UIPluginCapability;
}) {
	const { t } = props.ctx;
	const verifyTotpRoute = props.capability.routes?.verifyTotp;
	const verifyOtpRoute = props.capability.routes?.verifyOtp;
	const verifyBackupRoute = props.capability.routes?.verifyBackupCode;
	const sendOtpRoute = props.capability.routes?.sendOtp;
	const supportsTotp = props.capability.metadata?.supportsTotp !== false;
	const supportsOtp = props.capability.metadata?.supportsOtp === true;
	const trustDeviceField = () => (
		<label class="ba-checkbox">
			<input type="checkbox" name="trustDevice" class="ba-checkbox-input" />
			<span>{t("twoFactor.trustDevice")}</span>
		</label>
	);
	return (
		<Dialog
			id="two-factor-challenge"
			title={t("twoFactor.verificationTitle")}
			description={t("twoFactor.verificationDescription")}
		>
			<div class="ba-two-factor-challenge">
				{supportsTotp && verifyTotpRoute ? (
					<section class="ba-two-factor-method" data-ba-2fa-method="totp">
						<h3 class="ba-two-factor-method-title">
							{t("twoFactor.authenticatorApp")}
						</h3>
						<Form
							action={verifyTotpRoute}
							pending={t("twoFactor.verifyingCode")}
							success={[
								effects.toast({
									level: "success",
									message: t("twoFactor.codeVerified"),
								}),
								effects.reload(),
							]}
							error={[
								effects.toastFromError({
									fallback: t("twoFactor.codeError"),
								}),
							]}
						>
							<Input
								name="code"
								label={t("twoFactor.authenticatorCode")}
								autocomplete="one-time-code"
								required
							/>
							{trustDeviceField()}
							<Button type="submit" class="ba-button-full">
								{t("twoFactor.verifyCode")}
							</Button>
						</Form>
					</section>
				) : null}
				{supportsOtp && sendOtpRoute && verifyOtpRoute ? (
					<section class="ba-two-factor-method" data-ba-2fa-method="otp">
						<h3 class="ba-two-factor-method-title">
							{t("twoFactor.oneTimeCode")}
						</h3>
						<Form
							action={sendOtpRoute}
							pending={t("twoFactor.sendingCode")}
							success={[
								effects.toast({
									level: "success",
									message: t("twoFactor.oneTimeCodeSent"),
								}),
							]}
							error={[
								effects.toastFromError({
									fallback: t("twoFactor.oneTimeCodeError"),
								}),
							]}
						>
							<Button type="submit" class="ba-button-secondary ba-button-full">
								{t("twoFactor.sendOneTimeCode")}
							</Button>
						</Form>
						<Form
							action={verifyOtpRoute}
							pending={t("twoFactor.verifyingCode")}
							success={[
								effects.toast({
									level: "success",
									message: t("twoFactor.codeVerified"),
								}),
								effects.reload(),
							]}
							error={[
								effects.toastFromError({
									fallback: t("twoFactor.oneTimeCodeVerifyError"),
								}),
							]}
						>
							<Input
								name="code"
								label={t("twoFactor.oneTimeCode")}
								autocomplete="one-time-code"
								required
							/>
							{trustDeviceField()}
							<Button type="submit" class="ba-button-full">
								{t("twoFactor.verifyOneTimeCode")}
							</Button>
						</Form>
					</section>
				) : null}
				{verifyBackupRoute ? (
					<section class="ba-two-factor-method" data-ba-2fa-method="backup">
						<h3 class="ba-two-factor-method-title">
							{t("twoFactor.backupCode")}
						</h3>
						<Form
							action={verifyBackupRoute}
							pending={t("twoFactor.verifyingBackupCode")}
							success={[
								effects.toast({
									level: "success",
									message: t("twoFactor.backupCodeVerified"),
								}),
								effects.reload(),
							]}
							error={[
								effects.toastFromError({
									fallback: t("twoFactor.backupCodeError"),
								}),
							]}
						>
							<Input name="code" label={t("twoFactor.backupCode")} required />
							{trustDeviceField()}
							<Button type="submit" class="ba-button-full">
								{t("twoFactor.verifyBackupCode")}
							</Button>
						</Form>
					</section>
				) : null}
			</div>
		</Dialog>
	);
}

function CredentialSegment(props: {
	ctx: UIContext;
	hasUsername: boolean;
	children: UIChild;
}) {
	const { t } = props.ctx;
	if (!props.hasUsername) {
		return <div data-ba-credential-scope>{props.children}</div>;
	}
	return (
		<div data-ba-credential-scope>
			<div
				class="ba-auth-segment"
				role="tablist"
				aria-label="Sign-in identifier"
			>
				<button
					type="button"
					class="ba-auth-segment-btn"
					data-ba-unstyled
					data-ba-credential-mode="email"
					aria-pressed="true"
					role="tab"
				>
					{t("credential.email")}
				</button>
				<button
					type="button"
					class="ba-auth-segment-btn"
					data-ba-unstyled
					data-ba-credential-mode="username"
					aria-pressed="false"
					role="tab"
				>
					{t("credential.username")}
				</button>
			</div>
			{props.children}
		</div>
	);
}

function EmailSignInForm(props: { ctx: UIContext }) {
	const { t } = props.ctx;
	const redirectTo = getRedirectTo(props.ctx);
	return (
		<div data-ba-credential-panel="email">
			<Form
				action={routes.signIn.email}
				pending={t("signIn.signingIn")}
				success={[
					effects.toast({
						level: "success",
						message: t("signIn.success"),
					}),
					effects.navigate(redirectTo),
				]}
				error={[
					effects.toastFromError({
						fallback: t("signIn.error"),
					}),
				]}
			>
				<Input
					name="email"
					label={t("field.email")}
					type="email"
					autocomplete="email"
					placeholder={t("placeholder.email")}
					required
				/>
				<PasswordField
					ctx={props.ctx}
					name="password"
					autocomplete="current-password"
					placeholder={t("placeholder.password")}
					forgotPasswordHref={uiHref(props.ctx, "/forgot-password")}
				/>
				<label class="ba-checkbox">
					<input type="checkbox" name="rememberMe" class="ba-checkbox-input" />
					<span>{t("action.rememberMe")}</span>
				</label>
				<Button type="submit" class="ba-button-full">
					{t("signIn.submit")}
				</Button>
			</Form>
		</div>
	);
}

function UsernameSignInForm(props: {
	ctx: UIContext;
	capability: UIPluginCapability;
	hidden?: boolean | undefined;
}) {
	const { t } = props.ctx;
	const redirectTo = getRedirectTo(props.ctx);
	const minUsernameLength = getNumberMetadata(
		props.capability,
		"minUsernameLength",
		3,
	);
	const maxUsernameLength = getNumberMetadata(
		props.capability,
		"maxUsernameLength",
		30,
	);
	return (
		<div data-ba-credential-panel="username" hidden={props.hidden}>
			<Form
				action={routes.signIn.username}
				pending={t("signIn.signingIn")}
				success={[
					effects.toast({
						level: "success",
						message: t("signIn.success"),
					}),
					effects.navigate(redirectTo),
				]}
				error={[
					effects.toastFromError({
						fallback: t("signIn.username.error"),
					}),
				]}
			>
				<Input
					name="username"
					label={t("field.username")}
					autocomplete="username"
					minlength={minUsernameLength}
					maxlength={maxUsernameLength}
					placeholder={t("placeholder.enterUsername")}
					required
				/>
				<PasswordField
					ctx={props.ctx}
					name="password"
					autocomplete="current-password"
					placeholder={t("placeholder.password")}
					forgotPasswordHref={uiHref(props.ctx, "/forgot-password")}
				/>
				<label class="ba-checkbox">
					<input type="checkbox" name="rememberMe" class="ba-checkbox-input" />
					<span>{t("action.rememberMe")}</span>
				</label>
				<Button type="submit" class="ba-button-full">
					{t("signIn.username.submit")}
				</Button>
			</Form>
		</div>
	);
}

function MagicLinkPanel(props: {
	ctx: UIContext;
	capability: UIPluginCapability;
}) {
	const { t } = props.ctx;
	const signInRoute = props.capability.routes?.signIn;
	const redirectTo = getRedirectTo(props.ctx);
	return (
		<div data-ba-method-panel="magic-link" hidden>
			<Form
				action={signInRoute}
				pending={t("magicLink.sending")}
				success={[
					effects.toast({
						level: "success",
						message: t("magicLink.success"),
					}),
				]}
				error={[
					effects.toastFromError({
						fallback: t("magicLink.error"),
					}),
				]}
			>
				<Input
					name="email"
					label={t("field.email")}
					type="email"
					autocomplete="email"
					placeholder={t("placeholder.email")}
					required
				/>
				<input type="hidden" name="callbackURL" value={redirectTo} />
				<Button type="submit" class="ba-button-full">
					{t("magicLink.sendSubmit")}
				</Button>
			</Form>
		</div>
	);
}

function EmailOtpPanel(props: {
	ctx: UIContext;
	capability: UIPluginCapability;
}) {
	const { t } = props.ctx;
	const sendRoute = props.capability.routes?.sendVerificationOtp;
	const signInRoute = props.capability.routes?.signIn;
	const redirectTo = getRedirectTo(props.ctx);
	const otpLength = getNumberMetadata(props.capability, "otpLength", 6);
	return (
		<div data-ba-method-panel="email-otp" hidden data-ba-otp-scope>
			<div data-ba-panel="email-otp-request">
				<Form
					action={sendRoute}
					pending={t("emailOtp.sendingCode")}
					success={[
						effects.toast({
							level: "success",
							message: t("emailOtp.codeSent"),
						}),
						effects.hide("email-otp-request"),
						effects.show("email-otp-verify"),
					]}
					error={[
						effects.toastFromError({
							fallback: t("emailOtp.sendError"),
						}),
					]}
					data-ba-otp-request
				>
					<Input
						name="email"
						label={t("field.email")}
						type="email"
						autocomplete="email"
						placeholder={t("placeholder.email")}
						required
					/>
					<input type="hidden" name="type" value="sign-in" />
					<Button type="submit" class="ba-button-full">
						{t("emailOtp.sendSubmit")}
					</Button>
				</Form>
			</div>
			<div data-ba-panel="email-otp-verify" hidden>
				<Form
					action={signInRoute}
					pending={t("emailOtp.verifyingCode")}
					success={[
						effects.toast({
							level: "success",
							message: t("signIn.success"),
						}),
						effects.navigate(redirectTo),
					]}
					error={[
						effects.toastFromError({
							fallback: t("emailOtp.verifyError"),
						}),
					]}
					data-ba-otp-verify
				>
					<Input
						name="email"
						label={t("field.email")}
						type="email"
						autocomplete="email"
						placeholder={t("placeholder.email")}
						required
						data-ba-otp-email-echo
					/>
					<Input
						name="otp"
						label={t("emailOtp.verificationCode")}
						autocomplete="one-time-code"
						inputmode="numeric"
						minlength={otpLength}
						maxlength={otpLength}
						required
					/>
					<Button type="submit" class="ba-button-full">
						{t("emailOtp.verifySubmit")}
					</Button>
				</Form>
				<button
					type="button"
					class="ba-button ba-button-outline"
					data-ba-unstyled
					data-ba-otp-back
				>
					{t("emailOtp.useADifferentEmail")}
				</button>
			</div>
		</div>
	);
}

function MethodSwitcher(props: {
	ctx: UIContext;
	hasPassword: boolean;
	hasMagicLink: boolean;
	hasEmailOtp: boolean;
}) {
	const { t } = props.ctx;
	const methods: { id: string; label: string }[] = [];
	if (props.hasPassword)
		methods.push({ id: "password", label: t("method.password") });
	if (props.hasMagicLink)
		methods.push({ id: "magic-link", label: t("method.magicLink") });
	if (props.hasEmailOtp)
		methods.push({ id: "email-otp", label: t("method.emailCode") });
	if (methods.length <= 1) return <></>;
	return (
		<div class="ba-auth-methods" role="tablist" aria-label="Sign-in method">
			{methods.map((method, index) => (
				<button
					type="button"
					class="ba-auth-method-btn"
					data-ba-unstyled
					data-ba-method={method.id}
					aria-pressed={index === 0 ? "true" : "false"}
					role="tab"
				>
					{method.label}
				</button>
			))}
		</div>
	);
}

function EmailSignUpForm(props: {
	ctx: UIContext;
	username: UIPluginCapability | null;
	passkey: UIPluginCapability | null;
	twoFactor: UIPluginCapability | null;
	additionalUserFields: UIChild;
}) {
	const { t } = props.ctx;
	const redirectTo = getRedirectTo(props.ctx);
	const minUsernameLength = getNumberMetadata(
		props.username,
		"minUsernameLength",
		3,
	);
	const maxUsernameLength = getNumberMetadata(
		props.username,
		"maxUsernameLength",
		30,
	);
	return (
		<Form
			action={routes.signUp.email}
			pending={t("signUp.creatingAccount")}
			success={[
				effects.toast({
					level: "success",
					message: t("signUp.success"),
				}),
				props.passkey || props.twoFactor
					? effects.openDialog("account-security")
					: effects.navigate(redirectTo),
			]}
			error={[
				effects.toastFromError({
					fallback: t("signUp.error"),
				}),
			]}
		>
			<Input
				name="name"
				label={t("field.name")}
				autocomplete="name"
				placeholder={t("placeholder.name")}
				required
			/>
			{props.username ? (
				<>
					<Input
						name="username"
						label={t("field.username")}
						autocomplete="username"
						minlength={minUsernameLength}
						maxlength={maxUsernameLength}
						placeholder={t("placeholder.username")}
						required
					/>
					{supportsDisplayUsername(props.username) ? (
						<Input
							name="displayUsername"
							label={t("field.displayName")}
							autocomplete="nickname"
							placeholder={t("placeholder.displayName")}
						/>
					) : null}
				</>
			) : null}
			<Input
				name="email"
				label={t("field.email")}
				type="email"
				autocomplete="email"
				placeholder={t("placeholder.email")}
				required
			/>
			{props.additionalUserFields}
			<PasswordField
				ctx={props.ctx}
				name="password"
				autocomplete="new-password"
				placeholder={t("placeholder.password")}
			/>
			<Button type="submit" class="ba-button-full">
				{t("signUp.submit")}
			</Button>
		</Form>
	);
}

export const authUI = (options?: AuthUIOptions) => {
	const pages: NonNullable<AuthUIOptions["pages"]> = {
		index: createUIPage({
			id: "auth-ui.index",
			path: "/",
			title: "Auth",
			middleware: [
				async (ctx) => {
					const authed = await hasActiveUISession(ctx);
					return uiRedirect(ctx, authed ? "/settings" : "/sign-in");
				},
			],
			render() {
				return <main class="ba-auth-page" />;
			},
		}),
		signIn: createUIPage({
			id: "auth-ui.sign-in",
			path: "/sign-in",
			title: "Sign In",
			render(ctx) {
				const { t } = ctx;
				const passkey = ctx.capability("passkey");
				const twoFactor = ctx.capability("two-factor");
				const lastMethod = ctx.capability("last-login-method");
				const username = ctx.capability("username");
				const magicLink = ctx.capability("magic-link");
				const emailOtp = ctx.capability("email-otp");
				const phoneNumber = ctx.capability("phone-number");
				const providers = getAuthProviders(ctx);
				const hasPasskeyAuth = Boolean(
					passkey?.routes?.generateAuthenticateOptions &&
						passkey.routes.verifyAuthentication,
				);
				const signUpDisabled = isSignUpDisabled(ctx, options);
				const hasPassword =
					ctx.context.options.emailAndPassword?.enabled !== false;
				const hasMagicLink = Boolean(magicLink?.routes?.signIn);
				const hasEmailOtp = Boolean(
					emailOtp?.routes?.sendVerificationOtp && emailOtp?.routes?.signIn,
				);
				const hasCredentialMethods = hasPassword || hasMagicLink || hasEmailOtp;
				const hasAltButtons = Boolean(phoneNumber) || hasPasskeyAuth;
				const hasOtherMethods = providers.length > 0 || hasAltButtons;
				return (
					<AuthCard
						ctx={ctx}
						title={t("signIn.title")}
						description={t("signIn.description")}
						tabs={signUpDisabled ? undefined : "sign-in"}
					>
						{lastMethod ? (
							<LastLoginMethodHint ctx={ctx} capability={lastMethod} />
						) : null}
						<section class="ba-auth-credentials" data-ba-method-scope>
							<MethodSwitcher
								ctx={ctx}
								hasPassword={hasPassword}
								hasMagicLink={hasMagicLink}
								hasEmailOtp={hasEmailOtp}
							/>
							{hasPassword ? (
								<div data-ba-method-panel="password">
									<CredentialSegment ctx={ctx} hasUsername={Boolean(username)}>
										<EmailSignInForm ctx={ctx} />
										{username ? (
											<UsernameSignInForm
												ctx={ctx}
												capability={username}
												hidden
											/>
										) : null}
									</CredentialSegment>
								</div>
							) : null}
							{hasMagicLink && magicLink ? (
								<MagicLinkPanel ctx={ctx} capability={magicLink} />
							) : null}
							{hasEmailOtp && emailOtp ? (
								<EmailOtpPanel ctx={ctx} capability={emailOtp} />
							) : null}
						</section>
						{hasCredentialMethods && hasOtherMethods ? (
							<AuthDivider label={t("action.or")} />
						) : null}
						{hasOtherMethods ? (
							<ProviderButtons ctx={ctx} mode="signIn" providers={providers}>
								{phoneNumber ? <PhoneSignInButton ctx={ctx} /> : null}
								{hasPasskeyAuth ? <PasskeySignInButton ctx={ctx} /> : null}
							</ProviderButtons>
						) : null}
						<CaptchaConfig ctx={ctx} />
						{twoFactor ? (
							<TwoFactorChallengePanel ctx={ctx} capability={twoFactor} />
						) : null}
					</AuthCard>
				);
			},
		}),
		signInUsername: createUIPage({
			id: "auth-ui.sign-in-username",
			path: "/sign-in/username",
			title: "Sign In With Username",
			render(ctx) {
				const { t } = ctx;
				const username = ctx.capability("username");
				const twoFactor = ctx.capability("two-factor");
				const redirectTo = getRedirectTo(ctx);
				const minUsernameLength = getNumberMetadata(
					username,
					"minUsernameLength",
					3,
				);
				const maxUsernameLength = getNumberMetadata(
					username,
					"maxUsernameLength",
					30,
				);
				const signUpDisabled = isSignUpDisabled(ctx, options);
				return (
					<AuthCard
						ctx={ctx}
						title={t("signIn.username.title")}
						description={t("signIn.username.description")}
						tabs={signUpDisabled ? undefined : "sign-in"}
						footer={
							<>
								{t("signIn.username.preferEmail")}{" "}
								<Link href={uiHref(ctx, "/sign-in")}>
									{t("signIn.username.signInWithEmail")}
								</Link>
							</>
						}
					>
						<section class="ba-auth-credentials">
							<Form
								action={routes.signIn.username}
								pending={t("signIn.signingIn")}
								success={[
									effects.toast({
										level: "success",
										message: t("signIn.success"),
									}),
									effects.navigate(redirectTo),
								]}
								error={[
									effects.toastFromError({
										fallback: t("signIn.username.error"),
									}),
								]}
							>
								<Input
									name="username"
									label={t("field.username")}
									autocomplete="username"
									minlength={minUsernameLength}
									maxlength={maxUsernameLength}
									placeholder={t("placeholder.enterUsername")}
									required
								/>
								<PasswordField
									ctx={ctx}
									name="password"
									autocomplete="current-password"
									placeholder={t("placeholder.password")}
									forgotPasswordHref={uiHref(ctx, "/forgot-password")}
								/>
								<div class="ba-auth-links">
									<Link href={uiHref(ctx, "/sign-in")}>
										{t("signIn.username.useEmailInstead")}
									</Link>
								</div>
								<label class="ba-checkbox">
									<input
										type="checkbox"
										name="rememberMe"
										class="ba-checkbox-input"
									/>
									<span>{t("action.rememberMe")}</span>
								</label>
								<Button type="submit" class="ba-button-full">
									{t("signIn.username.submit")}
								</Button>
							</Form>
						</section>
						<CaptchaConfig ctx={ctx} />
						{twoFactor ? (
							<TwoFactorChallengePanel ctx={ctx} capability={twoFactor} />
						) : null}
					</AuthCard>
				);
			},
		}),
		signInPhone: createUIPage({
			id: "auth-ui.sign-in-phone",
			path: "/sign-in/phone",
			title: "Sign In With Phone",
			render(ctx) {
				const { t } = ctx;
				const phone = ctx.capability("phone-number");
				const twoFactor = ctx.capability("two-factor");
				const redirectTo = getRedirectTo(ctx);
				const signUpDisabled = isSignUpDisabled(ctx, options);
				if (!phone) {
					return (
						<AuthCardShim
							ctx={ctx}
							title={t("signIn.phone.unavailableTitle")}
							description={t("signIn.phone.unavailableDescription")}
						/>
					);
				}
				const signInRoute = phone.routes?.signIn;
				const sendOtpRoute = phone.routes?.sendOtp;
				const verifyRoute = phone.routes?.verify;
				const otpLength = getNumberMetadata(phone, "otpLength", 6);
				return (
					<AuthCard
						ctx={ctx}
						title={t("signIn.phone.title")}
						description={t("signIn.phone.description")}
						tabs={signUpDisabled ? undefined : "sign-in"}
						footer={
							<>
								{t("signIn.phone.preferEmail")}{" "}
								<Link href={uiHref(ctx, "/sign-in")}>
									{t("signIn.phone.signInWithEmail")}
								</Link>
							</>
						}
					>
						<section class="ba-auth-credentials" data-ba-method-scope>
							<div
								class="ba-auth-methods"
								role="tablist"
								aria-label="Sign-in method"
							>
								<button
									type="button"
									class="ba-auth-method-btn"
									data-ba-unstyled
									data-ba-method="password"
									aria-pressed="true"
									role="tab"
								>
									{t("method.password")}
								</button>
								<button
									type="button"
									class="ba-auth-method-btn"
									data-ba-unstyled
									data-ba-method="phone-otp"
									aria-pressed="false"
									role="tab"
								>
									{t("method.oneTimeCode")}
								</button>
							</div>
							{signInRoute ? (
								<div data-ba-method-panel="password">
									<Form
										action={signInRoute}
										pending={t("signIn.signingIn")}
										success={[
											effects.toast({
												level: "success",
												message: t("signIn.success"),
											}),
											effects.navigate(redirectTo),
										]}
										error={[
											effects.toastFromError({
												fallback: t("signIn.phone.error"),
											}),
										]}
									>
										<Input
											name="phoneNumber"
											label={t("field.phoneNumber")}
											type="tel"
											autocomplete="tel"
											placeholder={t("placeholder.phoneNumber")}
											required
										/>
										<PasswordField
											ctx={ctx}
											name="password"
											autocomplete="current-password"
											placeholder={t("placeholder.password")}
											forgotPasswordHref={uiHref(ctx, "/forgot-password")}
										/>
										<label class="ba-checkbox">
											<input
												type="checkbox"
												name="rememberMe"
												class="ba-checkbox-input"
											/>
											<span>{t("action.rememberMe")}</span>
										</label>
										<Button type="submit" class="ba-button-full">
											{t("signIn.submit")}
										</Button>
									</Form>
								</div>
							) : null}
							{sendOtpRoute && verifyRoute ? (
								<div data-ba-method-panel="phone-otp" hidden data-ba-otp-scope>
									<div data-ba-panel="phone-otp-request">
										<Form
											action={sendOtpRoute}
											pending={t("twoFactor.sendingCode")}
											success={[
												effects.toast({
													level: "success",
													message: t("phoneOtp.codeSent"),
												}),
												effects.hide("phone-otp-request"),
												effects.show("phone-otp-verify"),
											]}
											error={[
												effects.toastFromError({
													fallback: t("phoneOtp.sendError"),
												}),
											]}
											data-ba-otp-request
										>
											<Input
												name="phoneNumber"
												label={t("field.phoneNumber")}
												type="tel"
												autocomplete="tel"
												placeholder={t("placeholder.phoneNumber")}
												required
											/>
											<Button type="submit" class="ba-button-full">
												{t("phoneOtp.sendSubmit")}
											</Button>
										</Form>
									</div>
									<div data-ba-panel="phone-otp-verify" hidden>
										<Form
											action={verifyRoute}
											pending={t("emailOtp.verifyingCode")}
											success={[
												effects.toast({
													level: "success",
													message: t("signIn.success"),
												}),
												effects.navigate(redirectTo),
											]}
											error={[
												effects.toastFromError({
													fallback: t("phoneOtp.verifyError"),
												}),
											]}
											data-ba-otp-verify
										>
											<Input
												name="phoneNumber"
												label={t("field.phoneNumber")}
												type="tel"
												autocomplete="tel"
												placeholder={t("placeholder.phoneNumber")}
												required
												data-ba-otp-phone-echo
											/>
											<Input
												name="code"
												label={t("phoneOtp.verificationCode")}
												autocomplete="one-time-code"
												inputmode="numeric"
												minlength={otpLength}
												maxlength={otpLength}
												required
											/>
											<Button type="submit" class="ba-button-full">
												{t("phoneOtp.verifySubmit")}
											</Button>
										</Form>
										<button
											type="button"
											class="ba-button ba-button-outline"
											data-ba-unstyled
											data-ba-otp-back
										>
											{t("signIn.phone.useADifferentPhoneNumber")}
										</button>
									</div>
								</div>
							) : null}
						</section>
						<CaptchaConfig ctx={ctx} />
						{twoFactor ? (
							<TwoFactorChallengePanel ctx={ctx} capability={twoFactor} />
						) : null}
					</AuthCard>
				);
			},
		}),
		forgotPassword: createUIPage({
			id: "auth-ui.forgot-password",
			path: "/forgot-password",
			title: "Forgot Password",
			render(ctx) {
				const { t } = ctx;
				return (
					<AuthCard
						ctx={ctx}
						title={t("forgotPassword.title")}
						description={t("forgotPassword.description")}
						footer={
							<>
								{t("forgotPassword.rememberPassword")}{" "}
								<Link href={uiHref(ctx, "/sign-in")}>{t("action.signIn")}</Link>
							</>
						}
					>
						<Form
							action={routes.password.requestReset}
							pending={t("forgotPassword.sending")}
							success={[
								effects.toast({
									level: "success",
									message: t("forgotPassword.success"),
								}),
							]}
							error={[
								effects.toastFromError({
									fallback: t("forgotPassword.error"),
								}),
							]}
						>
							<Input
								name="email"
								label={t("field.email")}
								type="email"
								autocomplete="email"
								placeholder={t("placeholder.emailAddress")}
								required
							/>
							<Button type="submit" class="ba-button-full">
								{t("forgotPassword.submit")}
							</Button>
						</Form>
						<CaptchaConfig ctx={ctx} />
					</AuthCard>
				);
			},
		}),
		resetPassword: createUIPage({
			id: "auth-ui.reset-password",
			path: "/reset-password",
			title: "Reset Password",
			render(ctx) {
				const { t } = ctx;
				return (
					<AuthCard
						ctx={ctx}
						title={t("resetPassword.title")}
						description={t("resetPassword.description")}
						footer={
							<>
								{t("resetPassword.backTo")}{" "}
								<Link href={uiHref(ctx, "/sign-in")}>{t("action.signIn")}</Link>
							</>
						}
					>
						<Form
							action={routes.password.reset}
							pending={t("resetPassword.resetting")}
							success={[
								effects.toast({
									level: "success",
									message: t("resetPassword.success"),
								}),
								effects.navigate(uiHref(ctx, "/sign-in")),
							]}
							error={[
								effects.toastFromError({
									fallback: t("resetPassword.error"),
								}),
							]}
						>
							<input
								name="token"
								type="hidden"
								value={ctx.query.get("token") || ""}
							/>
							<Input
								name="newPassword"
								label={t("field.newPassword")}
								type="password"
								autocomplete="new-password"
								placeholder={t("placeholder.newPassword")}
								required
							/>
							<Button type="submit" class="ba-button-full">
								{t("resetPassword.submit")}
							</Button>
						</Form>
					</AuthCard>
				);
			},
		}),
		verifyEmail: createUIPage({
			id: "auth-ui.verify-email",
			path: "/verify-email",
			title: "Verify Email",
			render(ctx) {
				const { t } = ctx;
				return (
					<AuthCard
						ctx={ctx}
						title={t("verifyEmail.title")}
						description={t("verifyEmail.description")}
						footer={
							<>
								{t("resetPassword.backTo")}{" "}
								<Link href={uiHref(ctx, "/sign-in")}>{t("action.signIn")}</Link>
							</>
						}
					>
						<Form
							action={routes.email.sendVerification}
							pending={t("verifyEmail.sending")}
							success={[
								effects.toast({
									level: "success",
									message: t("verifyEmail.success"),
								}),
								effects.navigate(uiHref(ctx, "/sign-in")),
							]}
							error={[
								effects.toastFromError({
									fallback: t("verifyEmail.error"),
								}),
							]}
						>
							<Input
								name="email"
								label={t("field.email")}
								type="email"
								autocomplete="email"
								placeholder={t("placeholder.emailAddress")}
								required
							/>
							<Button type="submit" class="ba-button-full">
								{t("verifyEmail.submit")}
							</Button>
						</Form>
						<CaptchaConfig ctx={ctx} />
					</AuthCard>
				);
			},
		}),
	};

	if (!options?.disableSignUp) {
		pages.signUp = createUIPage({
			id: "auth-ui.sign-up",
			path: "/sign-up",
			title: "Sign Up",
			render(ctx) {
				const { t } = ctx;
				const passkey = ctx.capability("passkey");
				const twoFactor = ctx.capability("two-factor");
				const lastMethod = ctx.capability("last-login-method");
				const username = ctx.capability("username");
				const providers = getAuthProviders(ctx);
				const hasOtherMethods = providers.length > 0;
				const additionalUserFields = renderAdditionalUserFields(ctx);

				if (ctx.context.options.emailAndPassword?.disableSignUp) {
					return (
						<AuthCardShim
							ctx={ctx}
							title={t("signUp.disabledTitle")}
							description={t("signUp.disabledDescription")}
						/>
					);
				}

				return (
					<AuthCard
						ctx={ctx}
						title={t("signUp.title")}
						description={t("signUp.description")}
						tabs="sign-up"
						legalAction="signing up"
					>
						{lastMethod ? (
							<LastLoginMethodHint ctx={ctx} capability={lastMethod} />
						) : null}
						<section class="ba-auth-credentials">
							<EmailSignUpForm
								ctx={ctx}
								username={username}
								passkey={passkey}
								twoFactor={twoFactor}
								additionalUserFields={additionalUserFields}
							/>
						</section>
						{hasOtherMethods ? (
							<>
								<AuthDivider label={t("action.or")} />
								<ProviderButtons
									ctx={ctx}
									mode="signUp"
									providers={providers}
								/>
							</>
						) : null}
						<CaptchaConfig ctx={ctx} />
						{passkey || twoFactor ? (
							<AccountSecurityChooser
								ctx={ctx}
								passkey={passkey}
								twoFactor={twoFactor}
								redirectTo={getRedirectTo(ctx)}
							/>
						) : null}
						{passkey ? (
							<PasskeyRegistrationPanel ctx={ctx} capability={passkey} />
						) : null}
						{twoFactor ? (
							<TwoFactorEnrollmentPanel ctx={ctx} capability={twoFactor} />
						) : null}
					</AuthCard>
				);
			},
		});
	}

	Object.assign(pages, createSettingsPages(), options?.pages ?? {});

	return {
		id: "auth-ui",
		version: PACKAGE_VERSION,
		ui: {
			pages,
		},
		options,
	} satisfies BetterAuthPlugin;
};
