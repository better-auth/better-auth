import { createFileRoute } from "@tanstack/react-router";
import { LoginForm } from "~/components/login-form";

export const Route = createFileRoute("/auth/signin")({
	component: SignIn,
});

function SignIn() {
	return (
		<div className="container">
			<LoginForm />
		</div>
	);
}
