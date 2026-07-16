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

function IconPhone() {
	return (
		<Icon>
			<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
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

function PhoneNumberSettingsBody(props: { ctx: UIContext }) {
	const phoneNumber = props.ctx.capability("phone-number");
	if (!phoneNumber) return <div />;
	const sendOtpRoute = phoneNumber.routes?.sendOtp;
	const verifyPhoneRoute = phoneNumber.routes?.verify;

	return (
		<>
			<div data-ba-settings-phone>
				<p class="ba-settings-muted">No phone number configured</p>
				{sendOtpRoute ? (
					<button
						type="button"
						class="ba-button ba-button-outline"
						data-ba-open-dialog="settings-add-phone"
					>
						<IconPlus />
						Add Phone Number
					</button>
				) : null}
			</div>

			{sendOtpRoute && verifyPhoneRoute ? (
				<Dialog
					id="settings-add-phone"
					title="Add phone number"
					description="Verify a phone number for SMS-based two-factor codes."
				>
					<div data-ba-panel="settings-phone-send">
						<Form
							action={sendOtpRoute}
							pending="Sending code..."
							success={[
								effects.hide("settings-phone-send"),
								effects.show("settings-phone-verify"),
								effects.toast({
									level: "success",
									message: "Verification code sent.",
								}),
							]}
							error={[
								effects.toastFromError({
									fallback: "Could not send verification code.",
								}),
							]}
						>
							<Input
								name="phoneNumber"
								label="Phone number"
								type="tel"
								autocomplete="tel"
								placeholder="+1 555 000 0000"
								required
								data-ba-settings-phone-input
							/>
							<Button type="submit" class="ba-button-full">
								Send code
							</Button>
						</Form>
					</div>
					<div data-ba-panel="settings-phone-verify" hidden>
						<Form
							action={verifyPhoneRoute}
							pending="Verifying phone..."
							success={[
								effects.toast({
									level: "success",
									message: "Phone number verified.",
								}),
								effects.reload(),
							]}
							error={[
								effects.toastFromError({
									fallback: "Could not verify phone number.",
								}),
							]}
						>
							<input
								type="checkbox"
								name="updatePhoneNumber"
								checked={true}
								hidden
								data-ba-unstyled
							/>
							<Input
								name="phoneNumber"
								label="Phone number"
								type="tel"
								required
								data-ba-settings-phone-confirm
							/>
							<Input
								name="code"
								label="Verification code"
								autocomplete="one-time-code"
								required
							/>
							<Button type="submit" class="ba-button-full">
								Verify phone
							</Button>
						</Form>
					</div>
				</Dialog>
			) : null}
		</>
	);
}

export const phoneNumberSettingsCards: UISettingsCard[] = [
	{
		id: "phone-number",
		priority: 75,
		title: "Phone Number for 2FA",
		description: "Add a phone number to receive SMS verification codes for 2FA",
		icon: () => <IconPhone />,
		visible: (ctx) => ctx.hasCapability("phone-number"),
		render: (ctx) => <PhoneNumberSettingsBody ctx={ctx} />,
	},
];
