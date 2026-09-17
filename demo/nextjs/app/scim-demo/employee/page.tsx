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
import { isSCIMDemoEmployeePortalEnabled } from "@/lib/scim-demo";
import {
	getSCIMDemoEmployeePortalIdentity,
	getSCIMDemoEmployeePortalToken,
} from "@/lib/scim-demo-employee";
import { EmployeeSignIn, EmployeeSignOut } from "./employee-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Acme employee sign-in",
	description: "Sign in as a provisioned Acme employee through the SCIM demo.",
	referrer: "no-referrer",
};

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

interface EmployeePortalPageProps {
	searchParams: Promise<
		Readonly<Record<string, string | string[] | undefined>>
	>;
}

function readSingleParam(value: string | string[] | undefined): string | null {
	const first = Array.isArray(value) ? value[0] : value;
	return first ? first : null;
}

export default async function EmployeePortalPage({
	searchParams,
}: EmployeePortalPageProps) {
	if (!isSCIMDemoEmployeePortalEnabled()) notFound();
	const parameters = await searchParams;
	const signInErrorDescription =
		readSingleParam(parameters.error_description) ??
		readSingleParam(parameters.error);
	const requestHeaders = await headers();
	const context = await auth.$context;
	const portalToken = getSCIMDemoEmployeePortalToken(
		requestHeaders.get("cookie"),
	);
	const [portal, session] = await Promise.all([
		getSCIMDemoEmployeePortalIdentity(
			context.adapter,
			context.internalAdapter,
			requestHeaders.get("cookie"),
		),
		auth.api.getSession({ headers: requestHeaders }),
	]);
	if (!portal) {
		return (
			<main className="flex min-h-[70vh] items-center justify-center px-4 py-10">
				<MessageCard
					title="Access not available"
					description="This employee portal session is invalid or expired. Ask your administrator for a new link."
				/>
			</main>
		);
	}
	if (session && session.user.id !== portal.userId) {
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
							This portal is for {portal.displayName}, but another account is
							signed in.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<EmployeeSignOut returnURL="/scim-demo/employee" />
					</CardContent>
				</Card>
			</main>
		);
	}
	if (session) {
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
							Better Auth linked your verified Acme identity to the exact
							provisioned user.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-5">
						<dl className="divide-y border text-sm">
							{[
								["Name", session.user.name],
								["Work email", session.user.email],
								["Better Auth user ID", session.user.id],
								["Application role", portal.role ?? "None"],
								["Profile source", "Directory (SCIM)"],
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
						<EmployeeSignOut returnURL="/scim-demo/employee" />
					</CardContent>
				</Card>
			</main>
		);
	}
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
						Sign in to Acme
					</h1>
					<CardDescription>
						Use the local OIDC provider. Your directory account must remain
						active throughout sign-in.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-5">
					{signInErrorDescription ? (
						<div className="border border-destructive/50 bg-destructive/10 p-3">
							<p className="text-sm font-medium text-destructive">
								Sign-in failed
							</p>
							<p className="mt-1 text-xs text-destructive">
								{signInErrorDescription}. Try again below.
							</p>
						</div>
					) : null}
					<div className="border bg-muted/20 p-3">
						<p className="text-xs text-muted-foreground">Signing in as</p>
						<p className="mt-1 font-medium">{portal.displayName}</p>
						<p className="mt-0.5 break-all text-xs text-muted-foreground">
							{portal.email}
						</p>
					</div>
					<EmployeeSignIn
						callbackURL="/scim-demo/employee"
						loginHint={portalToken}
					/>
				</CardContent>
			</Card>
		</main>
	);
}
