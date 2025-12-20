import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { getQueryClient } from "../query-client";
import { organizationKeys } from "./keys";

export interface InviteRejectParams {
	invitationId: string;
}

export async function inviteReject(params: InviteRejectParams) {
	const { data, error } = await authClient.organization.rejectInvitation({
		invitationId: params.invitationId,
	});
	if (error) throw new Error(error.message);

	return data;
}
export type InviteRejectData = Awaited<ReturnType<typeof inviteReject>>;

export const useInviteRejectMutation = () => {
	const queryClient = getQueryClient();

	return useMutation({
		mutationFn: inviteReject,
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: organizationKeys.all(),
			});
			toast.success("You have declined the invitation");
		},
		onError: (error) => {
			toast.error(error.message || "Failed to decline the invitation");
		},
	});
};
