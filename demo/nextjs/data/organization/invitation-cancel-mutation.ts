import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { organizationKeys } from "./keys";

export interface InvitationCancelParams {
	invitationId: string;
}

export async function cancelInvitation(params: InvitationCancelParams) {
	const { data, error } = await authClient.organization.cancelInvitation({
		invitationId: params.invitationId,
	});
	if (error) throw new Error(error.message);

	return data;
}

export const useInvitationCancelMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: cancelInvitation,
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: organizationKeys.detail(),
			});
			toast.success("Invitation revoked successfully");
		},
		onError: (error) => {
			toast.error(error.message || "Failed to revoke the invitation");
		},
	});
};
