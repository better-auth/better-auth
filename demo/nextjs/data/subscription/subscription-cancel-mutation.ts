import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

export async function cancelSubscription(returnUrl: string) {
	const { data, error } = await authClient.subscription.cancel({
		returnUrl,
	});
	if (error) throw new Error(error.message);

	return data;
}
export type SubscriptionCancelData = Awaited<
	ReturnType<typeof cancelSubscription>
>;

export const useSubscriptionCancelMutation = () => {
	return useMutation({
		mutationFn: cancelSubscription,
		onError: (error) => {
			toast.error(error.message || "Failed to cancel subscription");
		},
	});
};
