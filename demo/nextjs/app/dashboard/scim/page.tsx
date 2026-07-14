import { ArrowLeft, KeyRound, Network } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
} from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { isSCIMDemoEnabled } from "@/lib/scim-demo";
import { SCIMWorkflow } from "./workflow";

export default async function Page() {
	const session = await auth.api.getSession({
		headers: await headers(),
	});
	if (!session) {
		redirect("/sign-in");
	}

	const enabled = isSCIMDemoEnabled();

	return (
		<main className="space-y-6">
			<Button variant="ghost" size="sm" asChild>
				<Link href="/dashboard">
					<ArrowLeft className="size-4" aria-hidden="true" />
					Back to dashboard
				</Link>
			</Button>

			<header className="space-y-2">
				<h1 className="text-balance text-3xl font-semibold tracking-tight">
					SCIM provisioning
				</h1>
				<p className="max-w-2xl text-pretty text-muted-foreground">
					Run a real directory lifecycle against this demo and inspect each
					server-confirmed state
				</p>
			</header>

			<Card>
				<CardHeader>
					<h2 className="font-semibold leading-none tracking-tight">
						Connection details
					</h2>
					<CardDescription>
						The browser never receives the SCIM bearer credential
					</CardDescription>
				</CardHeader>
				<CardContent>
					<dl className="grid gap-4 sm:grid-cols-2">
						<div className="border bg-muted/30 p-4">
							<dt className="flex items-center gap-2 text-sm text-muted-foreground">
								<Network className="size-4" aria-hidden="true" />
								Connection
							</dt>
							<dd className="mt-2 font-mono text-sm" translate="no">
								demo-directory
							</dd>
						</div>
						<div className="border bg-muted/30 p-4">
							<dt className="flex items-center gap-2 text-sm text-muted-foreground">
								<KeyRound className="size-4" aria-hidden="true" />
								Credential
							</dt>
							<dd className="mt-2 text-sm font-medium">
								{enabled ? "Stored on server" : "Not configured"}
							</dd>
						</div>
					</dl>
				</CardContent>
			</Card>

			{enabled ? (
				<SCIMWorkflow />
			) : (
				<Alert>
					<KeyRound className="size-4" aria-hidden="true" />
					<AlertTitle>SCIM demo unavailable</AlertTitle>
					<AlertDescription>
						Configure the server URL and credential to run this workflow
					</AlertDescription>
				</Alert>
			)}
		</main>
	);
}
