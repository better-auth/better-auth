/** @jsxImportSource @better-auth/ui */

import type { UISettingsCard } from "@better-auth/core";
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

function ApiKeySettingsBody() {
	return (
		<>
			<div data-ba-settings-api-keys>
				<p class="ba-settings-muted">Loading API keys...</p>
			</div>
			<button
				type="button"
				class="ba-button ba-button-outline"
				data-ba-open-dialog="settings-create-api-key"
			>
				<IconPlus />
				Create API Key
			</button>
			<Dialog
				id="settings-create-api-key"
				title="Create API key"
				description="Generate a new API key for programmatic access."
			>
				<Form
					action={{
						type: "auth-route",
						path: "/api-key/create",
						method: "POST",
					}}
					pending="Creating API key..."
					success={[
						effects.toast({
							level: "success",
							message:
								"API key created. Copy it now — it won't be shown again.",
						}),
						effects.reload(),
					]}
					error={[
						effects.toastFromError({
							fallback: "Could not create API key.",
						}),
					]}
					data-ba-api-key-create
				>
					<Input name="name" label="Name" placeholder="My API key" required />
					<Button type="submit" class="ba-button-full">
						Create
					</Button>
				</Form>
			</Dialog>
		</>
	);
}

export const apiKeySettingsCards: UISettingsCard[] = [
	{
		id: "api-key",
		priority: 55,
		title: "API Keys",
		description: "Create and revoke API keys for your account",
		icon: () => <IconKey />,
		visible: (ctx) =>
			ctx.hasCapability("api-key") || ctx.plugins.has("api-key"),
		render: () => <ApiKeySettingsBody />,
	},
];
