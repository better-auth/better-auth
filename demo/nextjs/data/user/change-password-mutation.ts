import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

interface ChangePasswordParams {
	currentPassword: string;
	newPassword: string;
	revokeOtherSessions?: boolean;
}

export async function changePassword(params: ChangePasswordParams) {
	const { data, error } = await authClient.changePassword(params);
	if (error) throw new Error(error.message);

	return data;
}
export type ChangePasswordData = Awaited<ReturnType<typeof changePassword>>;

export const useChangePasswordMutation = () => {
	return useMutation({
		mutationFn: changePassword,
		onSuccess: () => {
			toast.success("Password changed successfully");
		},
		onError: (error) => {
			toast.error(error.message || "Failed to change your password");
		},
	});
};
