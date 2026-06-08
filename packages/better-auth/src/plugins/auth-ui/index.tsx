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
	Text,
} from "@better-auth/ui";
import { getSafeUIRedirectTo } from "../../ui";
import { PACKAGE_VERSION } from "../../version";
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
			| "signIn"
			| "signInUsername"
			| "signUp"
			| "forgotPassword"
			| "resetPassword"
			| "verifyEmail",
			UIPage
		>
	>;
};

type AuthProvider = {
	id: string;
	label: string;
	route: "social" | "oauth2";
};

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
	if (ctx.theme.darkMode === true) {
		return resolveProviderIcon(
			icon.dark ?? icon.light,
			providerInitials(provider.label),
		);
	}
	if (ctx.theme.darkMode === false) {
		return resolveProviderIcon(
			icon.light ?? icon.dark,
			providerInitials(provider.label),
		);
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
	const logoUrl = props.ctx.theme.logoUrl;
	const logo =
		typeof logoUrl === "string"
			? { src: logoUrl }
			: props.ctx.theme.darkMode === true
				? { src: logoUrl?.dark }
				: props.ctx.theme.darkMode === false
					? { src: logoUrl?.light }
					: {
							src: logoUrl?.light,
							dark: logoUrl?.dark,
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

function AuthCard(props: {
	ctx: UIContext;
	title: string;
	description: string;
	footer?: UIChild | undefined;
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
	return (
		<main class="ba-auth-page">
			{brandBeforeCard}
			<Card class="ba-auth-card">
				<header class="ba-auth-header">
					<h1 class="ba-auth-title">{props.title}</h1>
					<p class="ba-auth-description">{props.description}</p>
				</header>
				{props.children}
				{props.footer ? <p class="ba-auth-footer">{props.footer}</p> : null}
			</Card>
			{brandAfterCard}
		</main>
	);
}

function ProviderButtons(props: {
	ctx: UIContext;
	mode: "signIn" | "signUp";
	providers: AuthProvider[];
}) {
	const redirectTo = getRedirectTo(props.ctx);
	if (props.providers.length === 0) return <></>;
	return (
		<section class="ba-auth-providers" aria-label="Other sign-in methods">
			{props.providers.map((provider) => (
				<Form
					class="ba-provider-form"
					action={
						provider.route === "oauth2"
							? routes.signIn.oauth2
							: routes.signIn.social
					}
					pending={`Redirecting to ${provider.label}...`}
					error={[
						effects.toastFromError({
							fallback: `Could not continue with ${provider.label}.`,
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
						<input type="checkbox" name="requestSignUp" checked hidden />
					) : null}
					<Button type="submit" class="ba-button-outline">
						<span class="ba-provider-icon">
							{providerIcon(provider, props.ctx)}
						</span>
						{provider.label}
					</Button>
				</Form>
			))}
		</section>
	);
}

function PasskeySignInButton(props: { ctx: UIContext }) {
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
			pending="Starting passkey sign in..."
			success={[
				effects.toast({
					level: "success",
					message: "Signed in with passkey.",
				}),
				effects.navigate(redirectTo),
			]}
			error={[
				effects.toastFromError({
					fallback: "Could not sign in with passkey.",
				}),
			]}
			data-ba-passkey-auth
			data-ba-passkey-verify={verifyAuthenticationPath}
		>
			<Button type="submit" class="ba-button-secondary ba-button-full">
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
				Sign in with Passkey
			</Button>
		</Form>
	);
}

function LastLoginMethodHint(props: {
	ctx: UIContext;
	capability: UIPluginCapability;
}) {
	const cookieName = props.capability.metadata?.cookieName;
	const lastMethod =
		typeof cookieName === "string"
			? readCookie(props.ctx.request, cookieName)
			: null;
	if (!lastMethod) {
		return (
			<Text>
				Better Auth can remember the last sign-in method used on this device.
			</Text>
		);
	}
	return <Text>Last used sign-in method: {lastMethod}.</Text>;
}

function PasskeyRegistrationPanel(props: {
	capability: UIPluginCapability;
	redirectTo: string;
}) {
	const registerRoute = props.capability.routes?.generateRegisterOptions;
	return (
		<Dialog
			id="passkey-registration"
			title="Add a passkey"
			description="Your account was created. Add a passkey now for faster, safer sign-ins."
		>
			<div class="ba-dialog-actions">
				{registerRoute ? (
					<Form
						action={registerRoute}
						pending="Preparing passkey registration..."
						success={[
							effects.toast({
								level: "success",
								message: "Passkey registration started.",
							}),
							effects.navigate(props.redirectTo),
						]}
						error={[
							effects.toastFromError({
								fallback: "Could not start passkey registration.",
							}),
						]}
					>
						<Button type="submit" class="ba-button-full">
							Add passkey
						</Button>
					</Form>
				) : null}
				<Link href={props.redirectTo} class="ba-button ba-button-secondary">
					Skip for now
				</Link>
			</div>
		</Dialog>
	);
}

function TwoFactorEnrollmentPanel(props: {
	capability: UIPluginCapability;
	redirectTo: string;
}) {
	const enableRoute = props.capability.routes?.enable;
	const supportsTotp = props.capability.metadata?.supportsTotp !== false;
	const supportsOtp = props.capability.metadata?.supportsOtp === true;
	return (
		<Dialog
			id="two-factor-enrollment"
			title="Secure your account"
			description={`Add an extra verification step before continuing.${supportsTotp ? " Authenticator apps are supported." : ""}${supportsOtp ? " One-time codes are supported." : ""}`}
		>
			<div class="ba-dialog-actions">
				{enableRoute ? (
					<Form
						action={enableRoute}
						pending="Preparing two-factor setup..."
						success={[
							effects.toast({
								level: "success",
								message: "Two-factor setup started.",
							}),
							effects.navigate(props.redirectTo),
						]}
						error={[
							effects.toastFromError({
								fallback: "Could not start two-factor setup.",
							}),
						]}
					>
						<Button type="submit" class="ba-button-full">
							Set up two-factor
						</Button>
					</Form>
				) : null}
				<Link href={props.redirectTo} class="ba-button ba-button-outline">
					Skip for now
				</Link>
			</div>
		</Dialog>
	);
}

function TwoFactorChallengePanel(props: { capability: UIPluginCapability }) {
	const verifyTotpRoute = props.capability.routes?.verifyTotp;
	const sendOtpRoute = props.capability.routes?.sendOtp;
	return (
		<Dialog
			id="two-factor-challenge"
			title="Two-factor verification"
			description="Enter your authenticator code or request a one-time code to continue."
		>
			{verifyTotpRoute ? (
				<Form
					action={verifyTotpRoute}
					pending="Verifying code..."
					success={[
						effects.toast({
							level: "success",
							message: "Two-factor code verified.",
						}),
						effects.reload(),
					]}
					error={[
						effects.toastFromError({
							fallback: "Could not verify two-factor code.",
						}),
					]}
				>
					<Input
						name="code"
						label="Authenticator code"
						autocomplete="one-time-code"
						required
					/>
					<Button type="submit">Verify code</Button>
				</Form>
			) : null}
			{sendOtpRoute ? (
				<Form
					action={sendOtpRoute}
					pending="Sending code..."
					success={[
						effects.toast({
							level: "success",
							message: "One-time code sent.",
						}),
					]}
					error={[
						effects.toastFromError({
							fallback: "Could not send one-time code.",
						}),
					]}
				>
					<Button type="submit">Send one-time code</Button>
				</Form>
			) : null}
		</Dialog>
	);
}

export const authUI = (options?: AuthUIOptions) =>
	({
		id: "auth-ui",
		version: PACKAGE_VERSION,
		ui: {
			pages: {
				signIn: createUIPage({
					id: "auth-ui.sign-in",
					path: "/sign-in",
					title: "Sign In",
					render(ctx) {
						const passkey = ctx.capability("passkey");
						const twoFactor = ctx.capability("two-factor");
						const lastMethod = ctx.capability("last-login-method");
						const username = ctx.capability("username");
						const providers = getAuthProviders(ctx);
						const redirectTo = getRedirectTo(ctx);
						const hasPasskeyAuth = Boolean(
							passkey?.routes?.generateAuthenticateOptions &&
								passkey.routes.verifyAuthentication,
						);
						return (
							<AuthCard
								ctx={ctx}
								title="Sign in to your account"
								description="Welcome back. Please sign in to continue."
								footer={
									options?.disableSignUp ? null : (
										<>
											Don't have an account?{" "}
											<Link href="./sign-up">Sign up</Link>
										</>
									)
								}
							>
								{lastMethod ? (
									<LastLoginMethodHint ctx={ctx} capability={lastMethod} />
								) : null}
								<section class="ba-auth-credentials">
									<Form
										action={routes.signIn.email}
										pending="Signing in..."
										success={[
											effects.toast({
												level: "success",
												message: "Signed in successfully.",
											}),
											effects.navigate(redirectTo),
										]}
										error={[
											effects.toastFromError({
												fallback: "Could not sign in.",
											}),
										]}
									>
										<Input
											name="email"
											label="Email"
											type="email"
											autocomplete="email"
											placeholder="Enter your email address"
											required
										/>
										<Input
											name="password"
											label="Password"
											type="password"
											autocomplete="current-password"
											placeholder="Enter your password"
											required
										/>
										<div class="ba-auth-links">
											{username ? (
												<Link href="./sign-in/username">
													Use username instead
												</Link>
											) : (
												<span />
											)}
											<Link href="./forgot-password">Forgot password?</Link>
										</div>
										<Button type="submit" class="ba-button-full">
											Continue
										</Button>
									</Form>
									{hasPasskeyAuth ? <PasskeySignInButton ctx={ctx} /> : null}
								</section>
								{providers.length > 0 ? (
									<>
										<div class="ba-auth-divider">or</div>
										<ProviderButtons
											ctx={ctx}
											mode="signIn"
											providers={providers}
										/>
									</>
								) : null}
								{twoFactor ? (
									<TwoFactorChallengePanel capability={twoFactor} />
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
						return (
							<AuthCard
								ctx={ctx}
								title="Sign in with username"
								description="Use your username and password to continue."
								footer={
									<>
										Prefer email?{" "}
										<Link href="../sign-in">Sign in with email</Link>
									</>
								}
							>
								<Form
									action={routes.signIn.username}
									pending="Signing in..."
									success={[
										effects.toast({
											level: "success",
											message: "Signed in successfully.",
										}),
										effects.navigate(redirectTo),
									]}
									error={[
										effects.toastFromError({
											fallback: "Could not sign in with username.",
										}),
									]}
								>
									<Input
										name="username"
										label="Username"
										autocomplete="username"
										minlength={minUsernameLength}
										maxlength={maxUsernameLength}
										placeholder="Enter your username"
										required
									/>
									<Input
										name="password"
										label="Password"
										type="password"
										autocomplete="current-password"
										placeholder="Enter your password"
										required
									/>
									<div class="ba-auth-links">
										<Link href="../sign-in">Use email instead</Link>
										<Link href="../forgot-password">Forgot password?</Link>
									</div>
									<Button type="submit" class="ba-button-full">
										Continue
									</Button>
								</Form>
								{twoFactor ? (
									<TwoFactorChallengePanel capability={twoFactor} />
								) : null}
							</AuthCard>
						);
					},
				}),
				signUp: createUIPage({
					id: "auth-ui.sign-up",
					path: "/sign-up",
					title: "Sign Up",
					render(ctx) {
						const passkey = ctx.capability("passkey");
						const twoFactor = ctx.capability("two-factor");
						const lastMethod = ctx.capability("last-login-method");
						const username = ctx.capability("username");
						const redirectTo = getRedirectTo(ctx);
						const providers = getAuthProviders(ctx);
						const hasOtherMethods = providers.length > 0;
						const additionalUserFields = renderAdditionalUserFields(ctx);
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
						return (
							<AuthCard
								ctx={ctx}
								title="Create your account"
								description="Start with your email or continue with a provider."
								footer={
									<>
										Already have an account?{" "}
										<Link href="./sign-in">Sign in</Link>
									</>
								}
							>
								{lastMethod ? (
									<LastLoginMethodHint ctx={ctx} capability={lastMethod} />
								) : null}
								<Form
									action={routes.signUp.email}
									pending="Creating your account..."
									success={[
										effects.toast({
											level: "success",
											message: "Account created successfully.",
										}),
										passkey
											? effects.openDialog("passkey-registration")
											: twoFactor
												? effects.openDialog("two-factor-enrollment")
												: effects.navigate(redirectTo),
									]}
									error={[
										effects.toastFromError({
											fallback: "Could not create your account.",
										}),
									]}
								>
									<Input
										name="name"
										label="Name"
										autocomplete="name"
										placeholder="Enter your name"
										required
									/>
									{username ? (
										<>
											<Input
												name="username"
												label="Username"
												autocomplete="username"
												minlength={minUsernameLength}
												maxlength={maxUsernameLength}
												placeholder="Choose a username"
												required
											/>
											{supportsDisplayUsername(username) ? (
												<Input
													name="displayUsername"
													label="Display name"
													autocomplete="nickname"
													placeholder="How your name should appear"
												/>
											) : null}
										</>
									) : null}
									<Input
										name="email"
										label="Email"
										type="email"
										autocomplete="email"
										placeholder="Enter your email address"
										required
									/>
									{additionalUserFields}
									<Input
										name="password"
										label="Password"
										type="password"
										autocomplete="new-password"
										placeholder="Create a password"
										required
									/>
									<Button type="submit" class="ba-button-full">
										Continue
									</Button>
								</Form>
								{hasOtherMethods ? (
									<>
										<div class="ba-auth-divider">or</div>
										<ProviderButtons
											ctx={ctx}
											mode="signUp"
											providers={providers}
										/>
									</>
								) : null}
								{passkey ? (
									<PasskeyRegistrationPanel
										capability={passkey}
										redirectTo={redirectTo}
									/>
								) : null}
								{twoFactor ? (
									<TwoFactorEnrollmentPanel
										capability={twoFactor}
										redirectTo={redirectTo}
									/>
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
						return (
							<AuthCard
								ctx={ctx}
								title="Reset your password"
								description="Enter your email and we'll send you a reset link."
								footer={
									<>
										Remember your password?{" "}
										<Link href="./sign-in">Sign in</Link>
									</>
								}
							>
								<Form
									action={routes.password.requestReset}
									pending="Sending reset link..."
									success={[
										effects.toast({
											level: "success",
											message:
												"If this email exists, a reset link has been sent.",
										}),
									]}
									error={[
										effects.toastFromError({
											fallback: "Could not send reset link.",
										}),
									]}
								>
									<Input
										name="email"
										label="Email"
										type="email"
										autocomplete="email"
										placeholder="Enter your email address"
										required
									/>
									<Button type="submit" class="ba-button-full">
										Send reset link
									</Button>
								</Form>
							</AuthCard>
						);
					},
				}),
				resetPassword: createUIPage({
					id: "auth-ui.reset-password",
					path: "/reset-password",
					title: "Reset Password",
					render(ctx) {
						return (
							<AuthCard
								ctx={ctx}
								title="Choose a new password"
								description="Use a new password that you have not used before."
								footer={
									<>
										Back to <Link href="./sign-in">sign in</Link>
									</>
								}
							>
								<Form
									action={routes.password.reset}
									pending="Resetting password..."
									success={[
										effects.toast({
											level: "success",
											message: "Password reset successfully.",
										}),
									]}
									error={[
										effects.toastFromError({
											fallback: "Could not reset password.",
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
										label="New password"
										type="password"
										autocomplete="new-password"
										placeholder="Enter your new password"
										required
									/>
									<Button type="submit" class="ba-button-full">
										Reset password
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
						return (
							<AuthCard
								ctx={ctx}
								title="Verify your email"
								description="Send a fresh verification link to your inbox."
								footer={
									<>
										Back to <Link href="./sign-in">sign in</Link>
									</>
								}
							>
								<Form
									action={routes.email.sendVerification}
									pending="Sending verification email..."
									success={[
										effects.toast({
											level: "success",
											message: "Verification email sent.",
										}),
									]}
									error={[
										effects.toastFromError({
											fallback: "Could not send verification email.",
										}),
									]}
								>
									<Input
										name="email"
										label="Email"
										type="email"
										autocomplete="email"
										placeholder="Enter your email address"
										required
									/>
									<Button type="submit" class="ba-button-full">
										Send verification email
									</Button>
								</Form>
							</AuthCard>
						);
					},
				}),
				...options?.pages,
			},
		},
		options,
	}) satisfies BetterAuthPlugin;
