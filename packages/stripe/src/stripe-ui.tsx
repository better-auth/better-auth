/** @jsxImportSource @better-auth/ui */

import type { UISettingsCard } from "@better-auth/core";
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

function IconCreditCard() {
	return (
		<Icon>
			<rect width="20" height="14" x="2" y="5" rx="2" />
			<path d="M2 10h20" />
		</Icon>
	);
}

function StripeSettingsBody() {
	return (
		<>
			<div data-ba-settings-stripe-subscription>
				<p class="ba-settings-muted">Loading subscription...</p>
			</div>
			<Form
				action={{
					type: "auth-route",
					path: "/subscription/billing-portal",
					method: "POST",
				}}
				pending="Opening billing portal..."
				success={[
					effects.toast({
						level: "success",
						message: "Redirecting to billing portal...",
					}),
				]}
				error={[
					effects.toastFromError({
						fallback: "Could not open billing portal.",
					}),
				]}
				data-ba-stripe-billing-portal
			>
				<input
					type="hidden"
					name="returnUrl"
					value=""
					data-ba-stripe-return-url
				/>
				<Button type="submit" class="ba-button ba-button-outline">
					Manage billing
				</Button>
			</Form>
		</>
	);
}

export const stripeSettingsCards: UISettingsCard[] = [
	{
		id: "stripe",
		priority: 20,
		title: "Billing",
		description: "Manage your subscription and payment methods",
		icon: () => <IconCreditCard />,
		visible: (ctx) => ctx.hasCapability("stripe"),
		render: () => <StripeSettingsBody />,
	},
];
