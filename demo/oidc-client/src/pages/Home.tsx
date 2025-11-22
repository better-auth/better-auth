import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/useAuth";

const features = [
	{
		name: "Authorization Code Flow with PKCE",
		description: "Secure OAuth 2.0 authorization flow with PKCE extension",
	},
	{
		name: "OpenID Connect",
		description: "Full OIDC support with ID tokens and user info",
	},
	{
		name: "Session Management",
		description: "Secure session handling with proper state management",
	},
	{
		name: "Single Sign-On",
		description: "SSO capabilities with Better Auth OIDC provider",
	},
];

export function Home() {
	const { login, isAuthenticated, isLoading } = useAuth();
	const [, setLocation] = useLocation();

	if (isLoading) {
		return (
			<div className="min-h-[80vh] flex items-center justify-center">
				<div className="text-muted-foreground">Loading...</div>
			</div>
		);
	}

	return (
		<div className="min-h-[80vh] flex items-center justify-center overflow-hidden no-visible-scrollbar px-6 md:px-0">
			<main className="flex flex-col gap-4 items-center justify-center">
				<div className="flex flex-col gap-1">
					<h3 className="font-bold text-4xl text-black dark:text-white text-center">
						Better Auth OIDC Client
					</h3>
					<p className="text-center break-words text-sm md:text-base text-muted-foreground">
						Official demo showcasing{" "}
						<a
							href="https://better-auth.com"
							target="_blank"
							rel="noopener noreferrer"
							className="italic underline"
						>
							Better Auth
						</a>{" "}
						as an OIDC provider with a client application.
					</p>
				</div>
				<div className="md:w-10/12 w-full flex flex-col gap-4">
					<div className="flex flex-col gap-3 pt-2 flex-wrap">
						<div className="border-y py-2 border-dotted bg-secondary/60 opacity-80">
							<div className="text-xs flex items-center gap-2 justify-center text-muted-foreground">
								<span className="text-center">
									This demo uses Better Auth as an OIDC provider and implements
									a compliant OIDC client
								</span>
							</div>
						</div>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
							{features.map((feature) => (
								<div
									key={feature.name}
									className="border rounded-md p-4 hover:border-foreground transition-colors"
								>
									<div className="font-medium mb-1">{feature.name}</div>
									<div className="text-muted-foreground text-xs">
										{feature.description}
									</div>
								</div>
							))}
						</div>
					</div>
					<div className="flex justify-center pt-4">
						{isAuthenticated ? (
							<Button
								onClick={() => setLocation("/dashboard")}
								size="lg"
								className="gap-2 min-w-[200px]"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="1.2em"
									height="1.2em"
									viewBox="0 0 24 24"
								>
									<path
										fill="currentColor"
										d="M2 3h20v18H2zm18 16V7H4v12z"
									></path>
								</svg>
								<span>Dashboard</span>
							</Button>
						) : (
							<Button
								onClick={() => login()}
								size="lg"
								className="gap-2 min-w-[200px]"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="1.2em"
									height="1.2em"
									viewBox="0 0 24 24"
								>
									<path
										fill="currentColor"
										d="M5 3H3v4h2V5h14v14H5v-2H3v4h18V3zm12 8h-2V9h-2V7h-2v2h2v2H3v2h10v2h-2v2h2v-2h2v-2h2z"
									></path>
								</svg>
								<span>Sign In with Better Auth</span>
							</Button>
						)}
					</div>
				</div>
			</main>
		</div>
	);
}
