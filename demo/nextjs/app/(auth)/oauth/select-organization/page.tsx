import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { GoBackBtn, SelectOrganizationBtn } from "./org-buttons";

export const metadata: Metadata = {
	title: "Select Organization",
	description: "Specify which organization to authorize to this application",
};

export default async function SelectOrganizationPage() {
	const organizations = await auth.api.listOrganizations({
		headers: await headers(),
	});
	return (
		<div className="w-full">
			<div className="flex items-center flex-col justify-center w-full md:py-10">
				<div className="md:w-[400px]">
					<Card className="w-full bg-zinc-900 border-zinc-800 rounded-none">
						<CardHeader>
							<CardTitle className="text-lg md:text-xl">
								Select Organization
							</CardTitle>
						</CardHeader>
						<CardContent className="p-6">
							{organizations.length ? (
								organizations.map((o, i) => (
									<SelectOrganizationBtn key={o.id ?? i} organization={o} />
								))
							) : (
								<div>
									<p>
										Application is requesting scopes for an organization but no
										organizations exist for this account.
									</p>
									<br />
									<div className="flex flex-col gap-1">
										<Link href="/dashboard">
											<Button className="w-full">Create Organization</Button>
										</Link>
										<GoBackBtn />
									</div>
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
