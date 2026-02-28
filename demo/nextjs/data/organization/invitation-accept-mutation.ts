import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { organizationKeys } from "./keys";

export interface InviteAcceptParams {
	invitationId: string;
}

export async function inviteAccept(params: InviteAcceptParams) {
	const { data, error } = await authClient.organization.acceptInvitation({
		invitationId: params.invitationId,
	});
	if (error) throw new Error(error.message);

	return data;
}
export type InviteAcceptData = Awaited<ReturnType<typeof inviteAccept>>;

export const useInviteAcceptMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: inviteAccept,
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: organizationKeys.all(),
			});
			toast.success("You have accepted the invitation");
		},
		onError: (error) => {
			toast.error(error.message || "Failed to accept the invitation");
		},
	});
};
