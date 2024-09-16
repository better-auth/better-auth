import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import UserCard from "./user-card"
import { OrganizationCard } from "./organization-card"


export default async function DashboardPage() {
    const [session, activeSessions] = await Promise.all([
        await auth.api.getSession({
            headers: headers()
        }),
        await auth.api.listSessions({
            headers: headers()
        })
    ])
    if (!session) {
        throw redirect("/sign-in")
    }
    return (
        <div className="w-full">
            <div className="flex gap-4 flex-col">
                <UserCard session={JSON.parse(JSON.stringify(session))} activeSessions={JSON.parse(JSON.stringify(activeSessions))} />
                <OrganizationCard session={JSON.parse(JSON.stringify(session))} />
            </div>
        </div>
    )
}