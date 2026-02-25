import { headers } from "next/headers";
import EntryButton from "@/components/entry-button";
import { auth } from "@/lib/auth";

const features: { name: string; link: string }[] = [
	{
		name: "Email & Password",
		link: "https://www.better-auth.com/docs/authentication/email-password",
	},
	{
		name: "Organization | Teams",
		link: "https://www.better-auth.com/docs/plugins/organization",
	},
	{
		name: "Passkeys",
		link: "https://www.better-auth.com/docs/plugins/passkey",
	},
	{
		name: "Multi Factor",
		link: "https://www.better-auth.com/docs/plugins/2fa",
	},
	{
		name: "Password Reset",
		link: "https://www.better-auth.com/docs/authentication/email-password#request-password-reset",
	},
	{
		name: "Email Verification",
		link: "https://www.better-auth.com/docs/authentication/email-password#email-verification",
	},
	{
		name: "Roles & Permissions",
		link: "https://www.better-auth.com/docs/plugins/organization#roles",
	},
	{
		name: "Rate Limiting",
		link: "https://www.better-auth.com/docs/reference/security#rate-limiting",
	},
	{
		name: "Session Management",
		link: "https://www.better-auth.com/docs/concepts/session-management",
	},
	{
		name: "Multiple Session",
		link: "https://www.better-auth.com/docs/plugins/multi-session",
	},
	{
		name: "Stripe Integration",
		link: "https://www.better-auth.com/docs/plugins/stripe",
	},
	{
		name: "Last Login Method",
		link: "https://www.better-auth.com/docs/plugins/last-login-method",
	},
	{
		name: "OAuth Provider",
		link: "https://www.better-auth.com/docs/plugins/oauth-provider",
	},
];

export default async function Page() {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	return (
		<div className="min-h-[80vh] flex items-center justify-center overflow-hidden no-visible-scrollbar">
			<main className="flex flex-col gap-4 row-start-2 items-center justify-center">
				<div className="flex flex-col gap-1">
					<h3 className="text-3xl sm:text-4xl text-black dark:text-white text-center">
						BETTER-AUTH.
					</h3>
					<p className="text-center wrap-break-word text-sm md:text-base">
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
				<div className="max-w-xl w-full flex flex-col gap-4">
					<div className="flex flex-col gap-3 pt-2 flex-wrap">
						<div className="border p-2 border-dashed bg-secondary/70">
							<div className="text-xs flex items-center gap-2 justify-center text-muted-foreground">
								<span className="text-center">
									All features on this demo are implemented with Better Auth
									without any custom backend code
								</span>
							</div>
						</div>
						<div className="flex gap-2 justify-center flex-wrap">
							{features.map((feature) => (
								<a
									className="border-b pb-1 text-muted-foreground text-xs cursor-pointer hover:text-foreground duration-150 ease-in-out transition-all hover:border-foreground flex items-center gap-1"
									key={feature.name}
									href={feature.link}
								>
									{feature.name}
								</a>
							))}
						</div>
					</div>

					<div className="flex items-center justify-center">
						<EntryButton session={session} />
					</div>
				</div>
			</main>
		</div>
	);
}
