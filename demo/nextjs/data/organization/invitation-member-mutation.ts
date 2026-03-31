import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { OrganizationRole } from "@/lib/auth";
import { authClient } from "@/lib/auth-client";
import { organizationKeys } from "./keys";

export interface InviteMemberParams {
	email: string;
	role: OrganizationRole;
}

export async function inviteMember(params: InviteMemberParams) {
	const { data, error } = await authClient.organization.inviteMember({
		email: params.email,
		role: params.role,
	});
	if (error) throw new Error(error.message);

	return data;
}

export const useInviteMemberMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: inviteMember,
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: organizationKeys.detail(),
			});
			toast.success("Member invited successfully");
		},
		onError: (error) => {
			toast.error(error.message || "Failed to invite member");
		},
	});
};
