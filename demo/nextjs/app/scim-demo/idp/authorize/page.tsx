import { ArrowLeft, Building2 } from "lucide-react";
import type { Metadata } from "next";
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
import { isSCIMDemoEnabled } from "@/lib/scim-demo";
import type { SCIMDemoOIDCSearchParams } from "@/lib/scim-demo-oidc";
import {
	getSCIMDemoOIDCAuthorizationFormFields,
	getSCIMDemoOIDCAuthorizationView,
} from "@/lib/scim-demo-oidc";
import type { IdentityProviderAuthorizationField } from "./account-picker";
import { AccountPicker } from "./account-picker";

export const metadata: Metadata = {
	title: "Acme Identity",
	description: "Choose an Acme employee account for the SCIM SSO demo.",
};

interface IdentityProviderPageProps {
	searchParams: Promise<
		Readonly<Record<string, string | string[] | undefined>>
	>;
}

export default async function IdentityProviderPage({
	searchParams,
}: IdentityProviderPageProps) {
	if (!isSCIMDemoEnabled()) notFound();
	const parameters: SCIMDemoOIDCSearchParams = await searchParams;
	const view = await getSCIMDemoOIDCAuthorizationView(parameters);

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
		{ name: "workspace_id", value: view.loginHintUser.workspaceId },
	];
	const accounts = [
		{
			displayName: view.loginHintUser.displayName,
			email: view.loginHintUser.email,
			givenName: view.loginHintUser.givenName,
			initials: view.loginHintUser.initials,
			userKey: view.loginHintUser.userKey,
		},
	];

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
						Choose the employee who is signing in to the Better Auth demo
					</CardDescription>
				</CardHeader>
				<CardContent>
					<h2 className="mb-2 text-sm font-semibold">Choose an account</h2>
					<p className="mb-5 text-sm leading-relaxed text-muted-foreground">
						Acme Identity represents the company identity provider. Choose an
						account to complete its authentication step and return to Better
						Auth.
					</p>
					<AccountPicker
						accounts={accounts}
						authorizationFields={authorizationFields}
					/>
				</CardContent>
			</Card>
		</main>
	);
}
