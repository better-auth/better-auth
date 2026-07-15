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

function IconAtSign() {
	return (
		<Icon>
			<circle cx="12" cy="12" r="4" />
			<path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
		</Icon>
	);
}

function UsernameSettingsBody() {
	return (
		<>
			<div data-ba-settings-username>
				<p class="ba-settings-muted">Loading username...</p>
			</div>
			<button
				type="button"
				class="ba-button ba-button-outline"
				data-ba-open-dialog="settings-edit-username"
			>
				Edit Username
			</button>
			<Dialog
				id="settings-edit-username"
				title="Edit username"
				description="Choose a unique username for your account."
			>
				<Form
					action={{
						type: "auth-route",
						path: "/update-user",
						method: "POST",
					}}
					pending="Updating username..."
					success={[
						effects.toast({
							level: "success",
							message: "Username updated.",
						}),
						effects.reload(),
					]}
					error={[
						effects.toastFromError({
							fallback: "Could not update username.",
						}),
					]}
				>
					<Input
						name="username"
						label="Username"
						autocomplete="username"
						placeholder="your_username"
						required
						data-ba-settings-username-input
					/>
					<Input
						name="displayUsername"
						label="Display name"
						autocomplete="nickname"
						placeholder="Display name"
						data-ba-settings-display-username-input
					/>
					<Button type="submit" class="ba-button-full">
						Save
					</Button>
				</Form>
			</Dialog>
		</>
	);
}

export const usernameSettingsCards: UISettingsCard[] = [
	{
		id: "username",
		priority: 90,
		title: "Username",
		description: "Your unique username and display name",
		icon: () => <IconAtSign />,
		visible: (ctx) => ctx.hasCapability("username"),
		render: () => <UsernameSettingsBody />,
	},
];
