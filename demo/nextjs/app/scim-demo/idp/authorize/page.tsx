import { ArrowLeft, Building2 } from "lucide-react";
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
import { resolveSCIMDemoEmployeePortalIdentityForFlow } from "@/lib/scim-demo-employee";
import type { SCIMDemoOIDCSearchParams } from "@/lib/scim-demo-oidc";
import {
	getSCIMDemoOIDCAuthorizationFormFields,
	getSCIMDemoOIDCAuthorizationView,
	getSCIMDemoOIDCLoginHint,
} from "@/lib/scim-demo-oidc";
import type { IdentityProviderAuthorizationField } from "./account-confirmation";
import { AccountConfirmation } from "./account-confirmation";

export const metadata: Metadata = {
	title: "Acme Identity",
	description: "Confirm the provisioned Acme identity for the SCIM SSO demo.",
};

interface IdentityProviderPageProps {
	searchParams: Promise<
		Readonly<Record<string, string | string[] | undefined>>
	>;
}

export default async function IdentityProviderPage({
	searchParams,
}: IdentityProviderPageProps) {
	if (!isSCIMDemoEmployeePortalEnabled()) notFound();
	const parameters: SCIMDemoOIDCSearchParams = await searchParams;
	const [requestHeaders, context] = await Promise.all([
		headers(),
		auth.$context,
	]);
	const identity = await resolveSCIMDemoEmployeePortalIdentityForFlow(
		context.adapter,
		context.internalAdapter,
		requestHeaders.get("cookie"),
		getSCIMDemoOIDCLoginHint(parameters),
	);
	if (!identity) {
		return (
			<main className="flex min-h-[70vh] items-center justify-center px-4 py-10">
				<Card className="w-full max-w-md rounded-none">
					<CardHeader>
						<h1 className="text-2xl font-semibold tracking-tight">
							Sign-in unavailable
						</h1>
						<CardDescription>
							The employee portal session is invalid or expired.
						</CardDescription>
					</CardHeader>
				</Card>
			</main>
		);
	}
	const view = await getSCIMDemoOIDCAuthorizationView(parameters, identity);

	if (view.status === "invalid") {
		return (
			<main className="flex min-h-[70vh] items-center justify-center px-4 py-10">
				<Card className="w-full max-w-md rounded-none">
					<CardHeader>
						<Badge variant="outline" className="w-fit">
							Demo identity provider
						</Badge>
						<h1 className="pt-2 text-2xl font-semibold tracking-tight">
							Sign-in request unavailable
						</h1>
						<CardDescription>
							This Acme sign-in request is missing required information or has
							expired. Return to employee sign-in and try again.
						</CardDescription>
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
			</main>
		);
	}

	const authorizationFields: IdentityProviderAuthorizationField[] = [
		...Object.entries(getSCIMDemoOIDCAuthorizationFormFields(view.request)).map(
			([name, value]) => ({ name, value }),
		),
	];
	const account = {
		displayName: view.employee.displayName,
		email: view.employee.email,
		givenName: view.employee.givenName,
		initials: view.employee.initials,
		userKey: view.employee.userKey,
	};

	return (
		<main className="flex min-h-[70vh] items-center justify-center px-4 py-10">
			<Card className="w-full max-w-md rounded-none">
				<CardHeader>
					<div className="mb-3 flex size-11 items-center justify-center border bg-muted">
						<Building2 className="size-5" aria-hidden="true" />
					</div>
					<Badge variant="outline" className="w-fit">
						Demo identity provider
					</Badge>
					<h1 className="pt-2 text-2xl font-semibold tracking-tight">
						Sign in with Acme Identity
					</h1>
					<CardDescription>
						Confirm the provisioned employee identity for this sign-in
					</CardDescription>
				</CardHeader>
				<CardContent>
					<h2 className="mb-2 text-sm font-semibold">Provisioned account</h2>
					<p className="mb-5 text-sm leading-relaxed text-muted-foreground">
						Acme Identity represents the company identity provider. This exact
						directory account is bound to the employee portal session.
					</p>
					<AccountConfirmation
						account={account}
						authorizationFields={authorizationFields}
					/>
				</CardContent>
			</Card>
		</main>
	);
}
