/** @jsxImportSource @better-auth/ui */

import type { UIContext, UIPage } from "@better-auth/core";
import type { UIChild } from "@better-auth/ui";
import {
	Button,
	Card,
	createUIPage,
	effects,
	Form,
	Input,
	Link,
} from "@better-auth/ui";

function SettingsShell(props: {
	ctx: UIContext;
	title: string;
	description: string;
	sections: { href: string; label: string }[];
	children: UIChild;
}) {
	return (
		<main class="ba-auth-page" data-ba-require-session>
			<div class="ba-settings-layout">
				<nav class="ba-settings-nav" aria-label="Settings">
					{props.sections.map((section) => (
						<Link href={section.href} class="ba-settings-nav-link">
							{section.label}
						</Link>
					))}
				</nav>
				<Card class="ba-settings-card">
					<header class="ba-auth-header" data-align="start">
						<h1 class="ba-auth-title">{props.title}</h1>
						<p class="ba-auth-description">{props.description}</p>
					</header>
					{props.children}
				</Card>
			</div>
		</main>
	);
}

function getSettingsSections(ctx: UIContext) {
	const sections = [
		{ href: "./settings", label: "Overview" },
		{ href: "./settings/profile", label: "Profile" },
		{ href: "./settings/password", label: "Password" },
	];
	if (ctx.context.options.user?.changeEmail?.enabled) {
		sections.push({ href: "./settings/email", label: "Email" });
	}
	sections.push({ href: "./settings/accounts", label: "Accounts" });
	if (ctx.hasCapability("passkey")) {
		sections.push({ href: "./settings/passkeys", label: "Passkeys" });
	}
	if (ctx.hasCapability("two-factor")) {
		sections.push({ href: "./settings/two-factor", label: "Two-Factor" });
	}
	return sections;
}

export function createSettingsPages(): Record<string, UIPage> {
	const pages: Record<string, UIPage> = {};

	pages.settings = createUIPage({
		id: "auth-ui.settings",
		path: "/settings",
		title: "Settings",
		render(ctx) {
			const sections = getSettingsSections(ctx);
			return (
				<SettingsShell
					ctx={ctx}
					title="Account Settings"
					description="Manage your account preferences."
					sections={sections}
				>
					<div class="ba-settings-hub" data-ba-settings-session>
						<p class="ba-auth-description">
							Select a section from the menu to manage your account.
						</p>
					</div>
					<nav class="ba-settings-section-list" aria-label="Settings sections">
						{sections.map((section) => (
							<Link href={section.href} class="ba-settings-section-link">
								{section.label}
							</Link>
						))}
					</nav>
				</SettingsShell>
			);
		},
	});

	pages.settingsProfile = createUIPage({
		id: "auth-ui.settings-profile",
		path: "/settings/profile",
		title: "Profile",
		render(ctx) {
			const sections = getSettingsSections(ctx);
			return (
				<SettingsShell
					ctx={ctx}
					title="Profile"
					description="Update your profile information."
					sections={sections}
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
						/>
						<Input
							name="image"
							label="Avatar URL"
							type="url"
							placeholder="https://example.com/avatar.jpg"
						/>
						<Button type="submit" class="ba-button-full">
							Save changes
						</Button>
					</Form>
				</SettingsShell>
			);
		},
	});

	pages.settingsPassword = createUIPage({
		id: "auth-ui.settings-password",
		path: "/settings/password",
		title: "Change Password",
		render(ctx) {
			const sections = getSettingsSections(ctx);
			return (
				<SettingsShell
					ctx={ctx}
					title="Change Password"
					description="Use a strong password you haven't used before."
					sections={sections}
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
				</SettingsShell>
			);
		},
	});

	pages.settingsEmail = createUIPage({
		id: "auth-ui.settings-email",
		path: "/settings/email",
		title: "Change Email",
		render(ctx) {
			if (!ctx.context.options.user?.changeEmail?.enabled) {
				return (
					<main class="ba-auth-page">
						<Card class="ba-auth-card">
							<header class="ba-auth-header" data-align="center">
								<h1 class="ba-auth-title">Email change unavailable</h1>
								<p class="ba-auth-description">
									Email changes are not enabled on this server.
								</p>
							</header>
							<Link href="./settings" class="ba-button ba-button-full">
								Back to settings
							</Link>
						</Card>
					</main>
				);
			}
			const sections = getSettingsSections(ctx);
			return (
				<SettingsShell
					ctx={ctx}
					title="Change Email"
					description="Update the email address associated with your account."
					sections={sections}
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
				</SettingsShell>
			);
		},
	});

	pages.settingsAccounts = createUIPage({
		id: "auth-ui.settings-accounts",
		path: "/settings/accounts",
		title: "Linked Accounts",
		render(ctx) {
			const sections = getSettingsSections(ctx);
			const providers = ctx.context.socialProviders;
			return (
				<SettingsShell
					ctx={ctx}
					title="Linked Accounts"
					description="Manage your connected social accounts."
					sections={sections}
				>
					<div data-ba-settings-accounts>
						<p class="ba-auth-description">Loading linked accounts...</p>
					</div>
					{providers.length > 0 ? (
						<section class="ba-settings-providers-hint">
							<p class="ba-auth-description">
								Available providers:{" "}
								{providers.map((p) => p.name || p.id).join(", ")}.
							</p>
						</section>
					) : null}
				</SettingsShell>
			);
		},
	});

	pages.settingsPasskeys = createUIPage({
		id: "auth-ui.settings-passkeys",
		path: "/settings/passkeys",
		title: "Passkeys",
		render(ctx) {
			const passkey = ctx.capability("passkey");
			if (!passkey) {
				return (
					<main class="ba-auth-page">
						<Card class="ba-auth-card">
							<header class="ba-auth-header" data-align="center">
								<h1 class="ba-auth-title">Passkeys unavailable</h1>
								<p class="ba-auth-description">
									Passkey support is not enabled on this server.
								</p>
							</header>
							<Link href="./settings" class="ba-button ba-button-full">
								Back to settings
							</Link>
						</Card>
					</main>
				);
			}
			const sections = getSettingsSections(ctx);
			const registerRoute = passkey.routes?.generateRegisterOptions;
			const verifyRegistration = passkey.routes?.verifyRegistration;
			const verifyRegistrationPath =
				verifyRegistration?.type === "auth-route"
					? verifyRegistration.path
					: undefined;
			return (
				<SettingsShell
					ctx={ctx}
					title="Passkeys"
					description="Register or remove passkeys for your account."
					sections={sections}
				>
					{registerRoute ? (
						<Form
							action={registerRoute}
							pending="Starting passkey registration..."
							success={[
								effects.toast({
									level: "success",
									message: "Passkey registered.",
								}),
								effects.reload(),
							]}
							error={[
								effects.toastFromError({
									fallback: "Could not register passkey.",
								}),
							]}
							data-ba-passkey-register
							data-ba-passkey-verify={verifyRegistrationPath}
						>
							<Button type="submit" class="ba-button-full">
								Add passkey
							</Button>
						</Form>
					) : null}
					<div data-ba-settings-passkeys>
						<p class="ba-auth-description">Loading passkeys...</p>
					</div>
				</SettingsShell>
			);
		},
	});

	pages.settingsTwoFactor = createUIPage({
		id: "auth-ui.settings-two-factor",
		path: "/settings/two-factor",
		title: "Two-Factor Authentication",
		render(ctx) {
			const twoFactor = ctx.capability("two-factor");
			if (!twoFactor) {
				return (
					<main class="ba-auth-page">
						<Card class="ba-auth-card">
							<header class="ba-auth-header" data-align="center">
								<h1 class="ba-auth-title">Two-factor unavailable</h1>
								<p class="ba-auth-description">
									Two-factor authentication is not enabled on this server.
								</p>
							</header>
							<Link href="./settings" class="ba-button ba-button-full">
								Back to settings
							</Link>
						</Card>
					</main>
				);
			}
			const sections = getSettingsSections(ctx);
			const enableRoute = twoFactor.routes?.enable;
			const disableRoute = twoFactor.routes?.disable;
			const verifyTotpRoute = twoFactor.routes?.verifyTotp;
			const allowPasswordless = twoFactor.metadata?.allowPasswordless === true;
			const supportsTotp = twoFactor.metadata?.supportsTotp !== false;
			return (
				<SettingsShell
					ctx={ctx}
					title="Two-Factor Authentication"
					description="Add an extra layer of security to your account."
					sections={sections}
				>
					{supportsTotp && enableRoute ? (
						<div data-ba-panel="two-factor-settings-setup">
							<h3 class="ba-two-factor-method-title">
								Set up authenticator app
							</h3>
							<Form
								action={enableRoute}
								pending="Preparing two-factor setup..."
								success={[
									effects.hide("two-factor-settings-setup"),
									effects.show("two-factor-settings-verify"),
								]}
								error={[
									effects.toastFromError({
										fallback: "Could not start two-factor setup.",
									}),
								]}
								data-ba-two-factor-enable
							>
								<input type="hidden" name="method" value="totp" />
								{allowPasswordless ? null : (
									<Input
										name="password"
										label="Current password"
										type="password"
										autocomplete="current-password"
										required
									/>
								)}
								<Button type="submit" class="ba-button-full">
									Enable two-factor
								</Button>
							</Form>
						</div>
					) : null}
					{supportsTotp && verifyTotpRoute ? (
						<div data-ba-panel="two-factor-settings-verify" hidden>
							<p class="ba-auth-description">
								Scan this QR code with your authenticator app, then enter the
								code.
							</p>
							<div class="ba-totp-qr" data-ba-totp-qr aria-live="polite" />
							<pre class="ba-backup-codes" data-ba-backup-codes hidden />
							<Form
								action={verifyTotpRoute}
								pending="Verifying authenticator..."
								success={[
									effects.toast({
										level: "success",
										message: "Two-factor authentication enabled.",
									}),
									effects.reload(),
								]}
								error={[
									effects.toastFromError({
										fallback: "Could not verify authenticator code.",
									}),
								]}
							>
								<Input
									name="code"
									label="Authenticator code"
									autocomplete="one-time-code"
									required
								/>
								<Button type="submit" class="ba-button-full">
									Verify and enable
								</Button>
							</Form>
						</div>
					) : null}
					{disableRoute ? (
						<section class="ba-settings-section">
							<h3 class="ba-two-factor-method-title">
								Disable two-factor authentication
							</h3>
							<Form
								action={disableRoute}
								pending="Disabling two-factor..."
								success={[
									effects.toast({
										level: "success",
										message: "Two-factor authentication disabled.",
									}),
									effects.reload(),
								]}
								error={[
									effects.toastFromError({
										fallback: "Could not disable two-factor.",
									}),
								]}
							>
								{allowPasswordless ? null : (
									<Input
										name="password"
										label="Current password"
										type="password"
										autocomplete="current-password"
										required
									/>
								)}
								<Button type="submit" class="ba-button-outline ba-button-full">
									Disable two-factor
								</Button>
							</Form>
						</section>
					) : null}
				</SettingsShell>
			);
		},
	});

	return pages;
}
