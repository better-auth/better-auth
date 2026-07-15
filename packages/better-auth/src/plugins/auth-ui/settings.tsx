/** @jsxImportSource @better-auth/ui */

import type {
	UIComponent,
	UIContext,
	UIPage,
	UISettingsCardVariant,
} from "@better-auth/core";
import type { UIChild } from "@better-auth/ui";
import {
	Button,
	createUIPage,
	Dialog,
	effects,
	Form,
	Input,
	routes,
} from "@better-auth/ui";
import { getUIBasePath } from "../../ui/utils";
import { hasActiveUISession, uiRedirect } from "./session";
import { KNOWN_PROVIDER_ICONS } from "./social-provider-icons";

function uiHref(ctx: UIContext, path: string) {
	const base = getUIBasePath(ctx.context.options);
	const normalized = path.startsWith("/") ? path : `/${path}`;
	return `${base}${normalized}`;
}

function redirectToSettings(ctx: UIContext) {
	return new Response(null, {
		status: 302,
		headers: {
			Location: uiHref(ctx, "/settings"),
		},
	});
}

type SettingsProvider = {
	id: string;
	label: string;
};

function formatProviderLabel(id: string, name?: string | undefined) {
	if (name && name !== id) return name;
	return id
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function getSettingsProviders(ctx: UIContext): SettingsProvider[] {
	const providers = new Map<string, SettingsProvider>();
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
			});
		}
	}
	for (const provider of ctx.context.socialProviders) {
		if (providers.has(provider.id)) continue;
		providers.set(provider.id, {
			id: provider.id,
			label: formatProviderLabel(provider.id, provider.name),
		});
	}
	return [...providers.values()];
}

function providerIcon(provider: SettingsProvider): UIChild {
	const icon =
		KNOWN_PROVIDER_ICONS[
			provider.id.toLowerCase() as keyof typeof KNOWN_PROVIDER_ICONS
		];
	if (!icon) {
		return (
			<span class="ba-settings-provider-fallback" aria-hidden="true">
				{provider.label.charAt(0).toUpperCase()}
			</span>
		);
	}
	if (
		typeof icon === "object" &&
		icon !== null &&
		!("tag" in icon) &&
		("dark" in icon || "light" in icon)
	) {
		const themed = icon as { dark?: UIChild; light?: UIChild };
		return (
			<>
				{themed.light ? (
					<span class="ba-provider-icon-light">{themed.light}</span>
				) : null}
				{themed.dark ? (
					<span class="ba-provider-icon-dark">{themed.dark}</span>
				) : null}
			</>
		);
	}
	return icon as UIChild;
}

function Icon(props: { children: UIChild; class?: string }) {
	return (
		<svg
			class={props.class ?? "ba-settings-icon"}
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
			{props.children}
		</svg>
	);
}

function IconUser() {
	return (
		<Icon>
			<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
			<circle cx="12" cy="7" r="4" />
		</Icon>
	);
}

function IconMail() {
	return (
		<Icon class="ba-settings-icon ba-settings-icon-sm">
			<path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" />
			<rect x="2" y="4" width="20" height="16" rx="2" />
		</Icon>
	);
}

function IconPencil() {
	return (
		<Icon class="ba-settings-icon ba-settings-icon-sm">
			<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
			<path d="m15 5 4 4" />
		</Icon>
	);
}

function IconLink() {
	return (
		<Icon>
			<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
			<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
		</Icon>
	);
}

function IconLock() {
	return (
		<Icon>
			<rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
			<path d="M7 11V7a5 5 0 0 1 10 0v4" />
		</Icon>
	);
}

function IconMonitor() {
	return (
		<Icon>
			<rect width="20" height="14" x="2" y="3" rx="2" />
			<path d="M8 21h8" />
			<path d="M12 17v4" />
		</Icon>
	);
}

function IconLogout() {
	return (
		<Icon class="ba-settings-icon ba-settings-icon-danger">
			<path d="m16 17 5-5-5-5" />
			<path d="M21 12H9" />
			<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
		</Icon>
	);
}

function IconTrash(props?: { class?: string }) {
	return (
		<Icon class={props?.class ?? "ba-settings-icon"}>
			<path d="M3 6h18" />
			<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
			<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
		</Icon>
	);
}

function SettingsPanel(props: {
	title: string;
	description: string;
	icon: UIChild;
	danger?: boolean | undefined;
	children: UIChild;
}) {
	return (
		<section
			class={
				props.danger
					? "ba-settings-panel ba-settings-panel--danger"
					: "ba-settings-panel"
			}
		>
			<header class="ba-settings-panel-header">
				<div class="ba-settings-panel-title-row">
					{props.icon}
					<h2 class="ba-settings-panel-title">{props.title}</h2>
				</div>
				<p class="ba-settings-panel-description">{props.description}</p>
			</header>
			<div class="ba-settings-panel-body">{props.children}</div>
		</section>
	);
}

function SettingsBrand(props: { ctx: UIContext }) {
	const appName = props.ctx.theme.appName ?? props.ctx.context.appName;
	const logoUrl = props.ctx.theme.logoUrl;
	const logo =
		typeof logoUrl === "string"
			? { src: logoUrl }
			: {
					src: logoUrl?.light,
					dark: logoUrl?.dark,
				};
	if (!logo.src) return <span hidden />;
	return (
		<a class="ba-settings-brand" href="/" aria-label={`${appName} home`}>
			<span class="ba-auth-logo" data-size="medium">
				{logo.dark ? (
					<picture>
						<source media="(prefers-color-scheme: dark)" srcset={logo.dark} />
						<img src={logo.src} alt={`${appName} logo`} draggable="false" />
					</picture>
				) : (
					<img src={logo.src} alt={`${appName} logo`} draggable="false" />
				)}
			</span>
		</a>
	);
}

function resolveCardText(
	value: string | ((ctx: UIContext) => string) | undefined,
	ctx: UIContext,
	fallback = "",
) {
	if (value == null) return fallback;
	return typeof value === "function" ? value(ctx) : value;
}

async function renderPluginSettingsCards(
	ctx: UIContext,
	variant: UISettingsCardVariant,
): Promise<UIComponent[]> {
	const cards = ctx
		.settingsCards()
		.filter((card) => (card.variant ?? "default") === variant);
	const rendered: UIComponent[] = [];
	for (const card of cards) {
		if (card.visible && !(await card.visible(ctx))) continue;
		const title = resolveCardText(card.title, ctx);
		const description = resolveCardText(card.description, ctx);
		const icon = card.icon ? card.icon(ctx) : <IconUser />;
		const body = await card.render(ctx);
		rendered.push(
			(
				<SettingsPanel
					icon={icon}
					title={title}
					description={description}
					danger={variant === "danger"}
				>
					{body}
				</SettingsPanel>
			) as UIComponent,
		);
	}
	return rendered;
}

async function SettingsPage(props: { ctx: UIContext }) {
	const { ctx } = props;
	const { t } = ctx;
	const providers = getSettingsProviders(ctx);
	const changeEmailEnabled = Boolean(
		ctx.context.options.user?.changeEmail?.enabled,
	);
	const deleteUserEnabled = Boolean(
		ctx.context.options.user?.deleteUser?.enabled,
	);
	const hasPassword = ctx.context.options.emailAndPassword?.enabled !== false;
	const pluginDefaultCards = await renderPluginSettingsCards(ctx, "default");
	const pluginDangerCards = await renderPluginSettingsCards(ctx, "danger");

	return (
		<main class="ba-auth-page ba-settings-page" data-ba-require-session>
			<div class="ba-settings-stack">
				<header class="ba-settings-page-header">
					<SettingsBrand ctx={ctx} />
					<div class="ba-settings-page-heading">
						<h1 class="ba-settings-page-title">Account Settings</h1>
						<p class="ba-settings-page-description">
							Manage your personal account settings and preferences
						</p>
					</div>
				</header>

				<SettingsPanel
					icon={<IconUser />}
					title="Profile"
					description="Your personal information and profile details"
				>
					<div class="ba-settings-profile-block">
						<div class="ba-settings-profile-top">
							<div data-ba-settings-profile>
								<p class="ba-settings-muted">Loading account...</p>
							</div>
							<div
								class="ba-settings-profile-actions"
								hidden
								data-ba-settings-profile-actions
							>
								{changeEmailEnabled ? (
									<button
										type="button"
										class="ba-settings-text-btn"
										data-ba-open-dialog="settings-change-email"
									>
										<IconMail />
										Change Email
									</button>
								) : null}
								<button
									type="button"
									class="ba-settings-text-btn"
									data-ba-open-dialog="settings-edit-profile"
								>
									<IconPencil />
									Edit
								</button>
							</div>
						</div>
						<div data-ba-settings-profile-infra hidden />
					</div>
				</SettingsPanel>

				{providers.length > 0 ? (
					<SettingsPanel
						icon={<IconLink />}
						title="Linked Accounts"
						description="Connect your account with external providers for easier sign-in"
					>
						<div class="ba-settings-provider-list" data-ba-settings-accounts>
							{providers.map((provider) => (
								<div
									class="ba-settings-provider-row"
									data-ba-provider-id={provider.id}
									data-ba-linked="false"
								>
									<div class="ba-settings-provider-meta">
										<span class="ba-provider-icon">
											{providerIcon(provider)}
										</span>
										<div class="ba-settings-provider-copy">
											<p class="ba-settings-provider-name">{provider.label}</p>
											<p
												class="ba-settings-provider-status"
												data-ba-provider-status
											>
												Sign in with {provider.label}
											</p>
										</div>
									</div>
									<Form
										class="ba-settings-provider-link-form"
										action={{
											type: "auth-route",
											path: "/link-social",
											method: "POST",
										}}
										pending={`Connecting ${provider.label}...`}
										error={[
											effects.toastFromError({
												fallback: `Could not link ${provider.label}.`,
											}),
										]}
										data-ba-provider-link
									>
										<input type="hidden" name="provider" value={provider.id} />
										<input
											type="hidden"
											name="callbackURL"
											value={uiHref(ctx, "/settings")}
										/>
										<Button
											type="submit"
											class="ba-button-outline ba-button-sm"
										>
											Link
										</Button>
									</Form>
									<button
										type="button"
										class="ba-settings-text-btn ba-settings-text-btn-danger"
										data-ba-provider-unlink
										hidden
									>
										Unlink
									</button>
								</div>
							))}
						</div>
					</SettingsPanel>
				) : null}

				{hasPassword ? (
					<SettingsPanel
						icon={<IconLock />}
						title="Password"
						description="Change your account password"
					>
						<button
							type="button"
							class="ba-button ba-button-outline"
							data-ba-open-dialog="settings-change-password"
						>
							<IconLock />
							Change Password
						</button>
					</SettingsPanel>
				) : null}

				{pluginDefaultCards}

				<SettingsPanel
					icon={<IconMonitor />}
					title="Active Sessions"
					description="Manage your active sessions across devices"
				>
					<div data-ba-settings-sessions>
						<p class="ba-settings-muted">Loading sessions...</p>
					</div>
				</SettingsPanel>

				<SettingsPanel
					icon={<IconLogout />}
					title="Sign Out"
					description="Sign out of your account on this device"
					danger
				>
					<Form
						action={routes.signOut}
						pending={t("action.signingOut")}
						success={[effects.navigate(uiHref(ctx, "/sign-in"))]}
						error={[
							effects.toastFromError({
								fallback: t("action.signOutError"),
							}),
						]}
					>
						<Button type="submit" class="ba-button ba-settings-btn-danger">
							{t("action.signOut")}
						</Button>
					</Form>
				</SettingsPanel>

				{deleteUserEnabled ? (
					<SettingsPanel
						icon={
							<IconTrash class="ba-settings-icon ba-settings-icon-danger" />
						}
						title="Delete Account"
						description="Permanently delete your account and all associated data"
						danger
					>
						<button
							type="button"
							class="ba-button ba-settings-btn-danger"
							data-ba-open-dialog="settings-delete-account"
						>
							<IconTrash />
							Delete Account
						</button>
					</SettingsPanel>
				) : null}

				{pluginDangerCards}
			</div>

			<Dialog
				id="settings-edit-profile"
				title="Edit profile"
				description="Update your name and avatar."
			>
				<Form
					action={{
						type: "auth-route",
						path: "/update-user",
						method: "POST",
					}}
					pending="Updating profile..."
					success={[
						effects.toast({
							level: "success",
							message: "Profile updated.",
						}),
						effects.reload(),
					]}
					error={[
						effects.toastFromError({
							fallback: "Could not update profile.",
						}),
					]}
				>
					<Input
						name="name"
						label="Name"
						autocomplete="name"
						placeholder="Your name"
						data-ba-settings-profile-name
					/>
					<Input
						name="image"
						label="Avatar URL"
						type="url"
						placeholder="https://example.com/avatar.jpg"
						data-ba-settings-profile-image
					/>
					<Button type="submit" class="ba-button-full">
						Save changes
					</Button>
				</Form>
			</Dialog>

			{changeEmailEnabled ? (
				<Dialog
					id="settings-change-email"
					title="Change email"
					description="Update the email address associated with your account."
				>
					<Form
						action={{
							type: "auth-route",
							path: "/change-email",
							method: "POST",
						}}
						pending="Changing email..."
						success={[
							effects.toast({
								level: "success",
								message: "Email change requested. Check your inbox.",
							}),
						]}
						error={[
							effects.toastFromError({
								fallback: "Could not change email.",
							}),
						]}
					>
						<Input
							name="newEmail"
							label="New email"
							type="email"
							autocomplete="email"
							placeholder="new@example.com"
							required
						/>
						<Button type="submit" class="ba-button-full">
							Change email
						</Button>
					</Form>
				</Dialog>
			) : null}

			{hasPassword ? (
				<Dialog
					id="settings-change-password"
					title="Change password"
					description="Use a strong password you haven't used before."
				>
					<Form
						action={{
							type: "auth-route",
							path: "/change-password",
							method: "POST",
						}}
						pending="Changing password..."
						success={[
							effects.toast({
								level: "success",
								message: "Password changed.",
							}),
						]}
						error={[
							effects.toastFromError({
								fallback: "Could not change password.",
							}),
						]}
					>
						<Input
							name="currentPassword"
							label="Current password"
							type="password"
							autocomplete="current-password"
							required
						/>
						<Input
							name="newPassword"
							label="New password"
							type="password"
							autocomplete="new-password"
							required
						/>
						<Button type="submit" class="ba-button-full">
							Change password
						</Button>
					</Form>
				</Dialog>
			) : null}

			{deleteUserEnabled ? (
				<Dialog
					id="settings-delete-account"
					title="Delete account"
					description="This permanently deletes your account and all associated data. This action cannot be undone."
				>
					<Form
						action={{
							type: "auth-route",
							path: "/delete-user",
							method: "POST",
						}}
						pending="Deleting account..."
						success={[
							effects.toast({
								level: "success",
								message: "Account deleted.",
							}),
							effects.navigate(uiHref(ctx, "/sign-in")),
						]}
						error={[
							effects.toastFromError({
								fallback: "Could not delete account.",
							}),
						]}
						data-ba-delete-account
					>
						<input
							type="hidden"
							name="callbackURL"
							value={uiHref(ctx, "/sign-in")}
						/>
						<Input
							name="confirmEmail"
							label="Type your email to confirm"
							type="email"
							autocomplete="off"
							placeholder="you@example.com"
							required
							data-ba-delete-account-confirm
						/>
						{hasPassword ? (
							<Input
								name="password"
								label="Password"
								type="password"
								autocomplete="current-password"
								required
							/>
						) : null}
						<Button type="submit" class="ba-button-full ba-settings-btn-danger">
							Delete account
						</Button>
					</Form>
				</Dialog>
			) : null}
		</main>
	);
}

export function createSettingsPages(): Record<string, UIPage> {
	const pages: Record<string, UIPage> = {};

	pages.settings = createUIPage({
		id: "auth-ui.settings",
		path: "/settings",
		title: "Settings",
		middleware: [
			async (ctx) => {
				const authed = await hasActiveUISession(ctx);
				if (!authed) return uiRedirect(ctx, "/sign-in");
			},
		],
		async render(ctx) {
			return await SettingsPage({ ctx });
		},
	});

	const legacyPaths = [
		["settingsProfile", "/settings/profile"],
		["settingsPassword", "/settings/password"],
		["settingsEmail", "/settings/email"],
		["settingsAccounts", "/settings/accounts"],
		["settingsPasskeys", "/settings/passkeys"],
		["settingsTwoFactor", "/settings/two-factor"],
	] as const;

	for (const [key, path] of legacyPaths) {
		pages[key] = createUIPage({
			id: `auth-ui.${key}`,
			path,
			title: "Settings",
			middleware: [
				async (ctx) => {
					return redirectToSettings(ctx);
				},
			],
			render() {
				return <main class="ba-auth-page" />;
			},
		});
	}

	return pages;
}
