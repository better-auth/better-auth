import { ArrowLeft, ShieldCheck, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
} from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { isSCIMDemoEnabled } from "@/lib/scim-demo";
import { createSCIMDemoEmployeePortalPath } from "@/lib/scim-demo-identity";
import {
	getSCIMDemoEmployeePortalState,
	hasSCIMDemoEmployeeRecord,
} from "@/lib/scim-demo-service";
import { EmployeeSignIn, EmployeeSignOut } from "./employee-actions";

export const metadata: Metadata = {
	title: "Acme employee sign-in",
	description: "Sign in as a provisioned Acme employee through the SCIM demo.",
};

interface EmployeePortalPageProps {
	searchParams: Promise<
		Readonly<Record<string, string | string[] | undefined>>
	>;
}

function readSearchParameter(
	searchParams: Readonly<Record<string, string | string[] | undefined>>,
	name: string,
) {
	const value = searchParams[name];
	return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

interface MessageCardProps {
	description: string;
	title: string;
}

function MessageCard({ description, title }: MessageCardProps) {
	return (
		<Card className="w-full max-w-lg rounded-none">
			<CardHeader>
				<Badge variant="outline" className="w-fit">
					Employee
				</Badge>
				<h1 className="pt-2 text-2xl font-semibold tracking-tight">{title}</h1>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>
				<Button variant="outline" className="min-h-11 w-full gap-2" asChild>
					<Link href="/">
						<ArrowLeft className="size-4" aria-hidden="true" />
						Back to Better Auth
					</Link>
				</Button>
			</CardContent>
		</Card>
	);
}

export default async function EmployeePortalPage({
	searchParams,
}: EmployeePortalPageProps) {
	if (!isSCIMDemoEnabled()) notFound();
	const parameters = await searchParams;
	const workspaceId = readSearchParameter(parameters, "workspace");
	const userKey = readSearchParameter(parameters, "user");
	const callbackError = readSearchParameter(parameters, "error");
	const requestHeaders = await headers();
	const [session, context] = await Promise.all([
		auth.api.getSession({ headers: requestHeaders }),
		auth.$context,
	]);
	const portal = await getSCIMDemoEmployeePortalState(
		context.adapter,
		workspaceId,
		userKey,
		session?.user.id,
	);

	if (portal.status === "invalid") {
		return (
			<main className="flex min-h-[70vh] items-center justify-center px-4 py-10">
				<MessageCard
					title="Access not available"
					description="This employee sign-in link isn't valid. Ask your administrator for a new link."
				/>
			</main>
		);
	}

	const employeePortalPath = createSCIMDemoEmployeePortalPath(
		portal.workspaceId,
		portal.userKey,
	);
	const isDifferentEmployee =
		session && !portal.isCurrentEmployee
			? await hasSCIMDemoEmployeeRecord(context.adapter, session.user.id)
			: false;
	if (session && !portal.isCurrentEmployee && isDifferentEmployee) {
		return (
			<main className="flex min-h-[70vh] items-center justify-center px-4 py-10">
				<Card className="w-full max-w-lg rounded-none">
					<CardHeader>
						<Badge variant="outline" className="w-fit">
							Employee
						</Badge>
						<h1 className="pt-2 text-2xl font-semibold tracking-tight">
							Switch employee account
						</h1>
						<CardDescription>
							This link is for {portal.displayName}, but you’re signed in as{" "}
							{session.user.name || session.user.email}. Switch accounts to
							continue.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<EmployeeSignOut
							buttonLabel="Sign out to switch account"
							returnURL={employeePortalPath}
						/>
					</CardContent>
				</Card>
			</main>
		);
	}
	if (session && !portal.isCurrentEmployee) {
		return (
			<main className="flex min-h-[70vh] items-center justify-center px-4 py-10">
				<Card className="w-full max-w-lg rounded-none">
					<CardHeader>
						<Badge variant="outline" className="w-fit">
							Employee
						</Badge>
						<h1 className="pt-2 text-2xl font-semibold tracking-tight">
							Use a private window
						</h1>
						<CardDescription>
							You’re already signed in as {session.user.email}. Open this
							employee link in a private window or another browser to keep the
							employee session separate.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button variant="outline" className="min-h-11 w-full gap-2" asChild>
							<Link href="/dashboard/scim">
								<ArrowLeft className="size-4" aria-hidden="true" />
								Return to administrator workspace
							</Link>
						</Button>
					</CardContent>
				</Card>
			</main>
		);
	}

	if (portal.isCurrentEmployee && session) {
		return (
			<main className="flex min-h-[70vh] items-center justify-center px-4 py-10">
				<Card className="w-full max-w-lg rounded-none">
					<CardHeader>
						<div className="mb-3 flex size-11 items-center justify-center border bg-muted">
							<ShieldCheck className="size-5" aria-hidden="true" />
						</div>
						<Badge variant="outline" className="w-fit">
							Employee
						</Badge>
						<h1 className="pt-2 text-2xl font-semibold tracking-tight">
							You’re signed in
						</h1>
						<CardDescription>
							Better Auth linked your verified Acme identity to the provisioned
							user.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-5">
						<section aria-labelledby="employee-account-heading">
							<h2
								id="employee-account-heading"
								className="text-sm font-semibold"
							>
								Your account
							</h2>
							<dl className="mt-3 divide-y border text-sm">
								{[
									["Name", session.user.name],
									["Work email", session.user.email],
									["Better Auth user ID", session.user.id],
									["Provisioned role", portal.role ?? "No provisioned role"],
									["Profile source", "Directory (SCIM)"],
									["Directory status", "Active"],
									["SSO account", "Linked"],
									["Session", "Active"],
								].map(([label, value]) => (
									<div
										key={label}
										className="grid gap-1 px-3 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4"
									>
										<dt className="text-muted-foreground">{label}</dt>
										<dd className="min-w-0 break-words font-medium">{value}</dd>
									</div>
								))}
							</dl>
						</section>
						<EmployeeSignOut returnURL={employeePortalPath} />
					</CardContent>
				</Card>
			</main>
		);
	}

	if (portal.directoryStatus === "inactive") {
		return (
			<main className="flex min-h-[70vh] items-center justify-center px-4 py-10">
				<MessageCard
					title="Account inactive"
					description="Your administrator has disabled application access. Contact them if you need access restored."
				/>
			</main>
		);
	}

	if (portal.directoryStatus !== "active" || !portal.applicationUserId) {
		const description =
			portal.directoryStatus === "not-provisioned"
				? "Your directory account hasn’t been provisioned. Contact your administrator, then try again."
				: "Your directory account is no longer provisioned. Contact your administrator if you need access restored.";
		return (
			<main className="flex min-h-[70vh] items-center justify-center px-4 py-10">
				<MessageCard title="Access not available" description={description} />
			</main>
		);
	}

	const signInUnavailable = Boolean(callbackError);
	return (
		<main className="flex min-h-[70vh] items-center justify-center px-4 py-10">
			<Card className="w-full max-w-lg rounded-none">
				<CardHeader>
					<div className="mb-3 flex size-11 items-center justify-center border bg-muted">
						<UserRound className="size-5" aria-hidden="true" />
					</div>
					<Badge variant="outline" className="w-fit">
						Employee
					</Badge>
					<h1 className="pt-2 text-2xl font-semibold tracking-tight">
						{signInUnavailable ? "Sign-in unavailable" : "Sign in to Acme"}
					</h1>
					<CardDescription>
						{signInUnavailable
							? "Acme SSO couldn’t start. Try again or contact your administrator."
							: "Use your Acme identity provider account. Your administrator must provision you before your first sign-in."}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-5">
					<div className="border bg-muted/20 p-3">
						<p className="text-xs text-muted-foreground">Signing in as</p>
						<p className="mt-1 font-medium">{portal.displayName}</p>
						<p className="mt-0.5 break-all text-xs text-muted-foreground">
							{portal.email}
						</p>
					</div>
					<EmployeeSignIn
						buttonLabel={signInUnavailable ? "Try again" : undefined}
						callbackURL={employeePortalPath}
						email={portal.email}
						loginHint={portal.email}
					/>
				</CardContent>
			</Card>
		</main>
	);
}
