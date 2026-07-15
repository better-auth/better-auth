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

function IconBuilding() {
	return (
		<Icon>
			<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
			<path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
			<path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
			<path d="M10 6h4" />
			<path d="M10 10h4" />
			<path d="M10 14h4" />
			<path d="M10 18h4" />
		</Icon>
	);
}

function OrganizationSettingsBody() {
	return (
		<>
			<div data-ba-settings-organizations>
				<p class="ba-settings-muted">Loading organizations...</p>
			</div>
			<div data-ba-settings-org-invitations>
				<p class="ba-settings-muted">Loading invitations...</p>
			</div>
		</>
	);
}

export const organizationSettingsCards: UISettingsCard[] = [
	{
		id: "organization",
		priority: 25,
		title: "Organizations",
		description: "Your organization memberships and pending invitations",
		icon: () => <IconBuilding />,
		visible: (ctx) => ctx.plugins.has("organization"),
		render: () => <OrganizationSettingsBody />,
	},
];
