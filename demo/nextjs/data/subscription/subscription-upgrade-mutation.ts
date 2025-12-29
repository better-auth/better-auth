import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

export async function upgradeSubscription(plan: string) {
	const { data, error } = await authClient.subscription.upgrade({
		plan,
		returnUrl: "/dashboard",
		successUrl: "/dashboard",
		cancelUrl: "/dashboard",
	});
	if (error) throw new Error(error.message);

	return data;
}
export type SubscriptionUpgradeData = Awaited<
	ReturnType<typeof upgradeSubscription>
>;

export const useSubscriptionUpgradeMutation = () => {
	return useMutation({
		mutationFn: upgradeSubscription,
		onError: (error) => {
			toast.error(error.message || "Failed to upgrade plan");
		},
	});
};
