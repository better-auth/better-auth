import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { userKeys } from "./keys";

interface UpdateUserParams {
	name?: string;
	image?: string;
}

export async function updateUser(params: UpdateUserParams) {
	const { data, error } = await authClient.updateUser(params);
	if (error) throw new Error(error.message);

	return data;
}
export type UpdateUserData = Awaited<ReturnType<typeof updateUser>>;

export const useUpdateUserMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: updateUser,
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: userKeys.session(),
			});
			toast.success("User updated successfully!");
		},
		onError: (error: any) => {
			toast.error(error.message || "Failed to update user");
		},
	});
};
