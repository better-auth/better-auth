"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { client } from "@/lib/auth-client";
import type { Organization } from "@/lib/auth-types";

export function SelectOrganizationBtn({
	organization,
}: {
	organization: Partial<Organization>;
}) {
	return (
		<Button
			className="w-full gap-2 h-12"
			variant="outline"
			onClick={async () => {
				await client.organization.setActive({
					organizationId: organization.id,
				});
				const { data } = await client.oauth2.continue({
					postLogin: true,
				});
				if (data?.redirect_uri) {
					window.location.href = data.redirect_uri;
					return;
				}
				toast.error("Failed to continue");
			}}
		>
			<Avatar className="mr-2 h-5 w-5">
				<AvatarImage
					src={organization.logo || undefined}
					alt={organization?.name}
				/>
				<AvatarFallback>{organization?.name?.charAt(0)}</AvatarFallback>
			</Avatar>
			<div className="flex text-start w-full">
				<div>
					<p>{organization?.name}</p>
				</div>
			</div>
		</Button>
	);
}

export function GoBackBtn() {
	const router = useRouter();
	return (
		<Button
			className="w-full gap-2 h-12"
			variant="outline"
			onClick={() => router.back()}
		>
			Go Back
		</Button>
	);
}
