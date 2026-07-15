/** @jsxImportSource @better-auth/ui */

import type { UIContext, UISettingsCard } from "@better-auth/core";
import type { UIChild } from "@better-auth/ui";
import { Button, effects, Form } from "@better-auth/ui";

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

function IconKey() {
	return (
		<Icon>
			<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" />
			<path d="m21 2-9.6 9.6" />
			<circle cx="7.5" cy="15.5" r="5.5" />
		</Icon>
	);
}

function IconPlus() {
	return (
		<Icon class="ba-settings-icon ba-settings-icon-sm">
			<path d="M5 12h14" />
			<path d="M12 5v14" />
		</Icon>
	);
}

function PasskeySettingsBody(props: { ctx: UIContext }) {
	const passkey = props.ctx.capability("passkey");
	if (!passkey) return <div />;
	const registerPasskey = passkey.routes?.generateRegisterOptions;
	const verifyPasskeyRegistration = passkey.routes?.verifyRegistration;
	const verifyPasskeyPath =
		verifyPasskeyRegistration?.type === "auth-route"
			? verifyPasskeyRegistration.path
			: undefined;

	return (
		<>
			<div data-ba-settings-passkeys>
				<p class="ba-settings-muted">Loading passkeys...</p>
			</div>
			{registerPasskey ? (
				<Form
					action={registerPasskey}
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
					data-ba-passkey-verify={verifyPasskeyPath}
				>
					<Button type="submit" class="ba-button ba-button-outline">
						<IconPlus />
						Add Passkey
					</Button>
				</Form>
			) : null}
		</>
	);
}

export const passkeySettingsCards: UISettingsCard[] = [
	{
		id: "passkey",
		priority: 70,
		title: "Passkeys",
		description: "Register or remove passkeys for passwordless sign-in",
		icon: () => <IconKey />,
		visible: (ctx) => ctx.hasCapability("passkey"),
		render: (ctx) => <PasskeySettingsBody ctx={ctx} />,
	},
];
