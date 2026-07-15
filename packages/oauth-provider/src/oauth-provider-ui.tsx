/** @jsxImportSource @better-auth/ui */

import type { UISettingsCard } from "@better-auth/core";
import type { UIChild } from "@better-auth/ui";

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

function IconAppWindow() {
	return (
		<Icon>
			<rect width="20" height="16" x="2" y="4" rx="2" />
			<path d="M10 4v4" />
			<path d="M2 8h20" />
			<path d="M6 4v4" />
		</Icon>
	);
}

function OAuthProviderSettingsBody() {
	return (
		<div data-ba-settings-oauth-consents>
			<p class="ba-settings-muted">Loading authorized applications...</p>
		</div>
	);
}

export const oauthProviderSettingsCards: UISettingsCard[] = [
	{
		id: "oauth-provider",
		priority: 50,
		title: "Authorized Applications",
		description: "Apps that have access to your account",
		icon: () => <IconAppWindow />,
		visible: (ctx) =>
			ctx.hasCapability("oauth-provider") || ctx.plugins.has("oauth-provider"),
		render: () => <OAuthProviderSettingsBody />,
	},
];
