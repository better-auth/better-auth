import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import UserCard from "./user-card";
import { OrganizationCard } from "./organization-card";
import AccountSwitcher from "@/components/account-switch";

export default async function DashboardPage() {
	const [session, activeSessions, deviceSessions, organization] =
		await Promise.all([
			auth.api.getSession({
				headers: await headers(),
			}),
			auth.api.listSessions({
				headers: await headers(),
			}),
			auth.api.listDeviceSessions({
				headers: await headers(),
			}),
			auth.api.getFullOrganization({
				headers: await headers(),
			}),
		]).catch((e) => {
			throw redirect("/sign-in");
		});
	return (
		<div className="w-full">
			<div className="flex gap-4 flex-col">
				<AccountSwitcher
					sessions={JSON.parse(JSON.stringify(deviceSessions))}
				/>
				<UserCard
					session={JSON.parse(JSON.stringify(session))}
					activeSessions={JSON.parse(JSON.stringify(activeSessions))}
				/>
				<OrganizationCard
					session={JSON.parse(JSON.stringify(session))}
					activeOrganization={JSON.parse(JSON.stringify(organization))}
				/>
			</div>
		</div>
	);
}
