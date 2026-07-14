import { ArrowRight, Network } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import AccountSwitcher from "@/components/account-switch";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { auth } from "@/lib/auth";
import OrganizationCard from "./_components/organization-card";
import SubscriptionCard from "./_components/subscription-card";
import UserCard from "./_components/user-card";

export default async function Page() {
	const requestHeaders = await headers();

	const session = await auth.api.getSession({
		headers: requestHeaders,
	});
	if (!session) {
		redirect("/sign-in");
	}

	const [activeSessions, deviceSessions] = await Promise.all([
		auth.api.listSessions({
			headers: requestHeaders,
		}),
		auth.api.listDeviceSessions({
			headers: requestHeaders,
		}),
	]);

	return (
		<div className="w-full">
			<div className="flex gap-4 flex-col">
				<AccountSwitcher
					deviceSessions={deviceSessions}
					initialSession={session}
				/>
				<UserCard session={session} activeSessions={activeSessions} />
				<Card>
					<CardHeader>
						<div className="flex items-start gap-3">
							<div className="border bg-muted p-2" aria-hidden="true">
								<Network className="size-5" />
							</div>
							<div className="space-y-1">
								<CardTitle>SCIM provisioning</CardTitle>
								<CardDescription>
									Run the live User and Group provisioning workflow
								</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent>
						<Button asChild>
							<Link href="/dashboard/scim">
								Open workflow
								<ArrowRight className="size-4" aria-hidden="true" />
							</Link>
						</Button>
					</CardContent>
				</Card>
				<OrganizationCard session={session} />
				<SubscriptionCard />
			</div>
		</div>
	);
}
