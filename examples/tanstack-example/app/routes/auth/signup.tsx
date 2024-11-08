import { createFileRoute } from "@tanstack/react-router";
import { RegisterForm } from "~/components/register-form";

export const Route = createFileRoute("/auth/signup")({
	component: SignUp,
});

function SignUp() {
	return (
		<div className="container">
			<RegisterForm />
		</div>
	);
}
