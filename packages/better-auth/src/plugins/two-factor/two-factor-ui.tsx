/** @jsxImportSource @better-auth/ui */

import type { UIContext, UISettingsCard } from "@better-auth/core";
import type { UIChild } from "@better-auth/ui";
import { Button, Dialog, effects, Form, Input } from "@better-auth/ui";

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

function IconShield() {
	return (
		<Icon>
			<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
		</Icon>
	);
}

function IconShieldOff() {
	return (
		<Icon>
			<path d="m2 2 20 20" />
			<path d="M5 5a1 1 0 0 0-1 1v7c0 5 3.5 7.5 7.67 8.94a1 1 0 0 0 .67.01c2.35-.84 4.48-2.45 5.8-4.8" />
			<path d="M9.474 9.474A4 4 0 0 0 12 15a4 4 0 0 0 3.526-2.053" />
			<path d="M19 11V6a1 1 0 0 0-1-1c-2 0-4.5-1.2-6.24-2.72a1.17 1.17 0 0 0-1.52 0C9.49 3.81 7.5 4.8 5.82 5.13" />
		</Icon>
	);
}

function TwoFactorSettingsBody(props: { ctx: UIContext }) {
	const twoFactor = props.ctx.capability("two-factor");
	if (!twoFactor) return <div />;
	const allowPasswordless = twoFactor.metadata?.allowPasswordless === true;
	const supportsTotp = twoFactor.metadata?.supportsTotp !== false;
	const enableRoute = twoFactor.routes?.enable;
	const disableRoute = twoFactor.routes?.disable;
	const verifyTotpRoute = twoFactor.routes?.verifyTotp;

	return (
		<>
			<div data-ba-settings-two-factor>
				<div class="ba-settings-status-card" data-ba-2fa-state="disabled">
					<div class="ba-settings-status-main">
						<IconShieldOff />
						<p class="ba-settings-status-text">
							2FA is disabled. Protect your account with an authenticator app.
						</p>
					</div>
					{supportsTotp && enableRoute ? (
						<button
							type="button"
							class="ba-button ba-button-sm ba-settings-btn-primary"
							data-ba-open-dialog="settings-enable-2fa"
						>
							<IconShield />
							Enable 2FA
						</button>
					) : null}
				</div>
				<div class="ba-settings-status-card" data-ba-2fa-state="enabled" hidden>
					<div class="ba-settings-status-main">
						<IconShield />
						<p class="ba-settings-status-text">
							2FA is enabled on your account.
						</p>
					</div>
					{disableRoute ? (
						<button
							type="button"
							class="ba-button ba-button-outline"
							data-ba-open-dialog="settings-disable-2fa"
						>
							Disable 2FA
						</button>
					) : null}
				</div>
			</div>

			{supportsTotp && enableRoute ? (
				<Dialog
					id="settings-enable-2fa"
					title="Enable two-factor authentication"
					description="Protect your account with an authenticator app."
				>
					<div data-ba-panel="two-factor-settings-setup">
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
								Continue
							</Button>
						</Form>
					</div>
					{verifyTotpRoute ? (
						<div data-ba-panel="two-factor-settings-verify" hidden>
							<p class="ba-auth-description">
								Scan this QR code with your authenticator app, then enter the
								code.
							</p>
							<div data-ba-method-scope>
								<div
									class="ba-auth-methods"
									role="tablist"
									aria-label="Two-factor setup"
								>
									<button
										type="button"
										class="ba-auth-method-btn"
										data-ba-unstyled
										data-ba-method="qr"
										aria-pressed="true"
										role="tab"
									>
										QR code
									</button>
									<button
										type="button"
										class="ba-auth-method-btn"
										data-ba-unstyled
										data-ba-method="backup"
										aria-pressed="false"
										role="tab"
									>
										Backup codes
									</button>
								</div>
								<div data-ba-method-panel="qr">
									<div class="ba-totp-qr" data-ba-totp-qr aria-live="polite" />
								</div>
								<div data-ba-method-panel="backup" hidden>
									<pre class="ba-backup-codes" data-ba-backup-codes />
									<p class="ba-dialog-description">
										Save your backup codes somewhere safe before you continue.
									</p>
								</div>
							</div>
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
									Confirm
								</Button>
							</Form>
						</div>
					) : null}
				</Dialog>
			) : null}

			{disableRoute ? (
				<Dialog
					id="settings-disable-2fa"
					title="Disable two-factor authentication"
					description="Your account will no longer require a second factor at sign-in."
				>
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
						<Button type="submit" class="ba-button-full ba-settings-btn-danger">
							Disable 2FA
						</Button>
					</Form>
				</Dialog>
			) : null}
		</>
	);
}

export const twoFactorSettingsCards: UISettingsCard[] = [
	{
		id: "two-factor",
		priority: 80,
		title: "Two-Factor Authentication",
		description: "Add an extra layer of security to your account",
		icon: () => <IconShield />,
		visible: (ctx) => ctx.hasCapability("two-factor"),
		render: (ctx) => <TwoFactorSettingsBody ctx={ctx} />,
	},
];
