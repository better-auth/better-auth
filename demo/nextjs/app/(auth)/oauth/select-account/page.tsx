import type { Metadata } from "next";
import { headers } from "next/headers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { AnotherAccountBtn, SelectAccountBtn } from "./account-button";

export const metadata: Metadata = {
	title: "Select Account",
	description: "Select account to authorize this application",
};

export default async function SelectAccountPage() {
	const sessions = await auth.api.listDeviceSessions({
		headers: await headers(),
	});
	return (
		<div className="w-full">
			<div className="flex items-center flex-col justify-center w-full md:py-10">
				<div className="md:w-[400px]">
					<Card className="w-full bg-zinc-900 border-zinc-800 rounded-none">
						<CardHeader>
							<CardTitle className="text-lg md:text-xl">
								Select Account
							</CardTitle>
						</CardHeader>
						<CardContent className="p-6">
							{sessions.map((s, i) => (
								<SelectAccountBtn key={s.session.id ?? i} session={s} />
							))}
						</CardContent>
						<AnotherAccountBtn />
					</Card>
				</div>
			</div>
		</div>
	);
}
