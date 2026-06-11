/** @jsxImportSource @better-auth/ui */

import {
	Button,
	Card,
	createUIPage,
	effects,
	Form,
	Input,
	routes,
	Text,
} from "@better-auth/ui";

export const ssoConfigPage = createUIPage({
	id: "sso.config",
	path: "/sso-config",
	title: "SSO Configuration",
	render(_ctx) {
		return (
			<main class="ba-page">
				<Card>
					<h1 style={{ margin: "0 0 1rem", fontSize: "1.5rem" }}>
						Configure SSO
					</h1>
					<Text style={{ color: "var(--ba-text-secondary)" }}>
						Register an OIDC provider for your organization. Existing provider
						management APIs remain available under the Better Auth API handler.
					</Text>
					<Form
						action={routes.sso.register}
						pending="Registering SSO provider..."
						success={[
							effects.toast({
								level: "success",
								message: "SSO provider registered successfully.",
							}),
						]}
						error={[
							effects.toastFromError({
								fallback: "Could not register SSO provider.",
							}),
						]}
					>
						<Input name="providerId" label="Provider ID" required />
						<Input name="issuer" label="Issuer URL" type="url" required />
						<Input name="domain" label="Domain" required />
						<Button type="submit">Register provider</Button>
					</Form>
				</Card>
			</main>
		);
	},
});
