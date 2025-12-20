import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { organizationKeys } from "./keys";

export interface MemberRemoveParams {
	memberIdOrEmail: string;
}

export async function removeMember(params: MemberRemoveParams) {
	const { data, error } = await authClient.organization.removeMember({
		memberIdOrEmail: params.memberIdOrEmail,
	});
	if (error) throw new Error(error.message);

	return data;
}

export const useMemberRemoveMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: removeMember,
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: organizationKeys.detail(),
			});
			toast.success("Member removed successfully");
		},
		onError: (error) => {
			toast.error(error.message || "Failed to remove member");
		},
	});
};
