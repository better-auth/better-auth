"use client";

import type { Organization } from "better-auth/plugins";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

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
				try {
					if (!organization.id) {
						toast.error("No organization");
						return;
					}
					const { data: active, error: activeError } =
						await authClient.organization.setActive({
							organizationId: organization.id,
						});
					if (activeError || !active) {
						toast.error(
							activeError?.message ?? "Failed to set active organization",
						);
						return;
					}
					const { data, error } = await authClient.oauth2.continue({
						postLogin: true,
					});
					if (error || !data?.redirect || !data.uri) {
						toast.error(error?.message ?? "Failed to continue");
						return;
					}
					window.location.href = data.uri;
				} catch (error) {
					toast.error(String(error));
				}
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
