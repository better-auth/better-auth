import { SignOut } from "@/components/signout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import UserCard from "@/components/user-card";
import { auth } from "@/lib/auth/server";
import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";

export const dynamic = true;

const User = async () => {
	const headersList = headers();
	const session = await auth.caller.getSession(headersList);
	return (
		<main className="flex min-h-screen flex-col items-center justify-between p-24">
			<div className="flex flex-col gap-4">
				{session && <UserCard user={session.user} />}

				{!session ? (
					<Link href="/signin">
						<Button>Sign In</Button>
					</Link>
				) : (
					<SignOut />
				)}
			</div>
		</main>
	);
};

export default async function Home() {
	return (
		<Suspense fallback={null}>
			<User />
		</Suspense>
	);
}
