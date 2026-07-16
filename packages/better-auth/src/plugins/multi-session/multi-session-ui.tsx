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

function IconUsers() {
	return (
		<Icon>
			<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
			<circle cx="9" cy="7" r="4" />
			<path d="M22 21v-2a4 4 0 0 0-3-3.87" />
			<path d="M16 3.13a4 4 0 0 1 0 7.75" />
		</Icon>
	);
}

function MultiSessionSettingsBody() {
	return (
		<div data-ba-settings-multi-session>
			<p class="ba-settings-muted">Loading accounts on this device...</p>
		</div>
	);
}

export const multiSessionSettingsCards: UISettingsCard[] = [
	{
		id: "multi-session",
		priority: 35,
		title: "Accounts on This Device",
		description: "Switch between accounts signed in on this device",
		icon: () => <IconUsers />,
		visible: (ctx) => ctx.plugins.has("multi-session"),
		render: () => <MultiSessionSettingsBody />,
	},
];
