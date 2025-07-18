import type { GenericEndpointContext } from "better-auth";
import type { StripeOptions, Usage } from "./types";

export async function getPlans(options: StripeOptions) {
	return typeof options?.subscription?.plans === "function"
		? await options.subscription?.plans()
		: options.subscription?.plans;
}

export async function getPlanByPriceId(
	options: StripeOptions,
	priceId: string,
) {
	return await getPlans(options).then((res) =>
		res?.find(
			(plan) =>
				plan.priceId === priceId || plan.annualDiscountPriceId === priceId,
		),
	);
}

export async function getPlanByName(options: StripeOptions, name: string) {
	return await getPlans(options).then((res) =>
		res?.find((plan) => plan.name.toLowerCase() === name.toLowerCase()),
	);
}

export async function getTotalUsage(
	ctx: GenericEndpointContext,
	refId: string,
	plan: string,
	options: StripeOptions,
) {
	// Get all the usage
	const usage = await ctx.context.adapter.findMany({
		model: "usage",
		where: [
			{ field: "referenceId", value: refId },
			{ field: "plan", value: plan },
			{ field: "currentlyActive", value: true },
		],
	});

	// add all the usage
	const totalUsage = (usage as Usage[]).reduce((acc, u) => acc + u.usage, 0);

	const currentPlan = await getPlanByName(options, plan);

	// calculate percentage usage
	const percentageUsage =
		(totalUsage / (currentPlan?.limits?.usageLimit || 0)) * 100;

	return { totalUsage: totalUsage, percentageUsage: percentageUsage };
}
