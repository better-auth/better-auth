import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { subscriptionKeys } from "./keys";

export async function restoreSubscription() {
	const { data, error } = await authClient.subscription.restore();
	if (error) throw new Error(error.message);

	return data;
}
export type SubscriptionRestoreData = Awaited<
	ReturnType<typeof restoreSubscription>
>;

export const useSubscriptionRestoreMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: restoreSubscription,
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: subscriptionKeys.all(),
			});
		},
		onError: (error) => {
			toast.error(error.message || "Failed to restore subscription");
		},
	});
};
