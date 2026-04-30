import { useConfig } from "@/config";
import {
	ForgotPasswordPage,
	ProfilePage,
	ResetPasswordPage,
	SignInPage,
	SignUpPage,
	VerifyEmailPage,
} from "./pages";

function PageRouter() {
	const config = useConfig();

	switch (config.page) {
		case "sign-in":
			return <SignInPage />;
		case "sign-up":
			return <SignUpPage />;
		case "forgot-password":
			return <ForgotPasswordPage />;
		case "reset-password":
			return <ResetPasswordPage />;
		case "verify-email":
			return <VerifyEmailPage />;
		case "profile":
			return <ProfilePage />;
		default:
			return <SignInPage />;
	}
}

export function App() {
	const config = useConfig();
	const isProfilePage = config.page === "profile";

	return (
		<div className="min-h-screen bg-background flex items-center justify-center p-4">
			<main className={isProfilePage ? "w-full" : ""}>
				<PageRouter />
			</main>
		</div>
	);
}
