import { SignInButton, SignInFallback } from "@/components/sign-in-btn";
import { Suspense } from "react";

export default async function Home() {
	const features = [
		"Email & Password",
		"Organization | Teams",
		"Passkeys",
		"Multi Factor",
		"Password Reset",
		"Email Verification",
		"Roles & Permissions",
		"Rate Limiting",
		"Session Management",
		"API Key Authorization",
	];
	return (
		<div className="min-h-[80vh] flex items-center justify-center overflow-hidden no-visible-scrollbar px-6 md:px-0">
			<main className="flex flex-col items-center justify-center row-start-2 gap-4">
				<div className="flex flex-col gap-1">
					<h3 className="text-4xl font-bold text-center text-black dark:text-white">
						Better Auth.
					</h3>
					<p className="text-sm text-center break-words md:text-base">
						Official demo to showcase{" "}
						<a
							href="https://better-auth.com"
							target="_blank"
							className="italic underline"
						>
							better-auth.
						</a>{" "}
						features and capabilities. <br />
					</p>
				</div>
				<div className="flex flex-col w-full gap-4 md:w-10/12">
					<div className="flex flex-col flex-wrap gap-3 pt-2">
						<div className="py-2 border-dotted border-y bg-secondary/60 opacity-80">
							<div className="flex items-center justify-center gap-2 text-xs text-muted-foreground ">
								<span className="text-center">
									All features on this demo are Implemented with better auth
									without any custom backend code
								</span>
							</div>
						</div>
						<div className="flex flex-wrap justify-center gap-2">
							{features.map((feature) => (
								<span
									className="flex items-center gap-1 pb-1 text-xs transition-all duration-150 ease-in-out border-b cursor-pointer text-muted-foreground hover:text-foreground hover:border-foreground"
									key={feature}
								>
									{feature}.
								</span>
							))}
						</div>
					</div>
					{/* @ts-ignore */}
					<Suspense fallback={<SignInFallback />}>
						{/* @ts-ignore */}
						<SignInButton />
					</Suspense>
				</div>
			</main>
		</div>
	);
}
