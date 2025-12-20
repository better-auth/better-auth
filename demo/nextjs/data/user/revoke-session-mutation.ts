import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { userKeys } from "./keys";

interface RevokeSessionParams {
	token: string;
}

export async function revokeSession(params: RevokeSessionParams) {
	const { data, error } = await authClient.revokeSession(params);
	if (error) throw new Error(error.message);

	return data;
}
export type RevokeSessionData = Awaited<ReturnType<typeof revokeSession>>;

export const useRevokeSessionMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: revokeSession,
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: userKeys.session(),
			});
			toast.success("Session terminated successfully");
		},
		onError: (error) => {
			toast.error(error.message || "Failed to terminate session");
		},
	});
};
