import { ArrowLeft, KeyRound } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { isSCIMDemoEnabled } from "@/lib/scim-demo";
import { isSCIMDemoManagementRole } from "@/lib/scim-demo-management";
import { SCIMSettings } from "./settings";

interface MemberRow {
	organizationId: string;
	role: string;
}

export default async function Page() {
	const requestHeaders = await headers();
	const session = await auth.api.getSession({ headers: requestHeaders });
	if (!session) redirect("/sign-in");

	let selectedOrganization:
		| {
				id: string;
				name: string;
		  }
		| undefined;
	if (isSCIMDemoEnabled()) {
		const [organizations, context] = await Promise.all([
			auth.api.listOrganizations({ headers: requestHeaders }),
			auth.$context,
		]);
		const memberships = await context.adapter.findMany<MemberRow>({
			model: "member",
			where: [{ field: "userId", value: session.user.id }],
		});
		const manageableOrganizationIds = new Set(
			memberships
				.filter((membership) => isSCIMDemoManagementRole(membership.role))
				.map((membership) => membership.organizationId),
		);
		const activeOrganizationId = session.session.activeOrganizationId;
		selectedOrganization =
			organizations.find(
				(organization) =>
					organization.id === activeOrganizationId &&
					manageableOrganizationIds.has(organization.id),
			) ??
			organizations.find((organization) =>
				manageableOrganizationIds.has(organization.id),
			);
	}

	return (
		<main className="relative left-1/2 w-[min(1440px,calc(100vw-2rem))] -translate-x-1/2 space-y-5">
			<Button variant="ghost" size="sm" className="min-h-11" asChild>
				<Link href="/dashboard">
					<ArrowLeft className="size-4" aria-hidden="true" />
					Back to dashboard
				</Link>
			</Button>

			<header className="space-y-2">
				<p className="text-sm font-medium text-muted-foreground">
					Organization settings
				</p>
				<h1 className="text-3xl font-semibold tracking-tight">
					Directory provisioning
				</h1>
				<p className="max-w-3xl text-muted-foreground">
					Create an organization-owned SCIM connection, test the real data
					plane, and inspect the resulting resources.
				</p>
			</header>

			{!isSCIMDemoEnabled() ? (
				<Alert>
					<KeyRound className="size-4" aria-hidden="true" />
					<AlertTitle>SCIM demo unavailable</AlertTitle>
					<AlertDescription>
						Configure the server URL, enable the demo, and set a dedicated
						credential pepper.
					</AlertDescription>
				</Alert>
			) : selectedOrganization ? (
				<SCIMSettings
					key={selectedOrganization.id}
					organizationId={selectedOrganization.id}
					organizationName={selectedOrganization.name}
				/>
			) : (
				<Alert>
					<KeyRound className="size-4" aria-hidden="true" />
					<AlertTitle>Organization administrator access required</AlertTitle>
					<AlertDescription>
						Create an organization or ask an owner to grant you an owner or
						administrator role.
					</AlertDescription>
				</Alert>
			)}
		</main>
	);
}
