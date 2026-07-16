import { ArrowLeft, KeyRound } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { getSCIMDemoBaseURL, isSCIMDemoEnabled } from "@/lib/scim-demo";
import {
	getSCIMDemoError,
	getSCIMDemoWorkspace,
} from "@/lib/scim-demo-service";
import { SCIMWorkspace } from "./workspace";

export default async function Page() {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session) redirect("/sign-in");
	const demoEnabled = isSCIMDemoEnabled();
	let initialWorkspace = null;
	let initialError: string | null = null;
	if (demoEnabled) {
		try {
			const context = await auth.$context;
			initialWorkspace = await getSCIMDemoWorkspace({
				baseURL: getSCIMDemoBaseURL(),
				database: context.adapter,
				operatorId: session.user.id,
			});
		} catch (error) {
			initialError = getSCIMDemoError(error).message;
		}
	}

	return (
		<main className="relative left-1/2 w-[min(1440px,calc(100vw-2rem))] -translate-x-1/2 space-y-5">
			<Button variant="ghost" size="sm" asChild>
				<Link href="/dashboard">
					<ArrowLeft className="size-4" aria-hidden="true" />
					Back to dashboard
				</Link>
			</Button>

			{demoEnabled ? (
				<SCIMWorkspace
					initialWorkspace={initialWorkspace}
					initialError={initialError}
				/>
			) : (
				<Alert>
					<KeyRound className="size-4" aria-hidden="true" />
					<AlertTitle>SCIM demo unavailable</AlertTitle>
					<AlertDescription>
						Configure the server URL and credential to open the directory
						workspace.
					</AlertDescription>
				</Alert>
			)}
		</main>
	);
}
