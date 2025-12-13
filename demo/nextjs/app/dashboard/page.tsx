import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AccountSwitcher from "@/components/account-switch";
import { auth } from "@/lib/auth";
import { OrganizationCard } from "./organization-card";
import UserCard from "./user-card";

export default async function DashboardPage() {
	const requestHeaders = await headers();

	const session = await auth.api.getSession({
		headers: requestHeaders,
	});
	if (!session) {
		redirect("/sign-in");
	}

	const [activeSessions, deviceSessions, organization, subscriptions] =
		await Promise.all([
			auth.api.listSessions({
				headers: requestHeaders,
			}),
			auth.api.listDeviceSessions({
				headers: requestHeaders,
			}),
			auth.api.getFullOrganization({
				headers: requestHeaders,
			}),
			auth.api.listActiveSubscriptions({
				headers: requestHeaders,
			}),
		]);

	return (
		<div className="w-full">
			<div className="flex gap-4 flex-col">
				<AccountSwitcher deviceSessions={deviceSessions} />
				<UserCard
					session={session}
					activeSessions={activeSessions}
					subscription={subscriptions.find(
						(sub) => sub.status === "active" || sub.status === "trialing",
					)}
				/>
				<OrganizationCard session={session} activeOrganization={organization} />
			</div>
		</div>
	);
}
