import type { StripeOptions } from "./types";

export async function getPlans(options: StripeOptions) {
	return typeof options?.subscription?.plans === "function"
		? await options.subscription?.plans()
		: options.subscription?.plans;
}

export async function getPlanByPriceInfo(
	options: StripeOptions,
	priceId: string,
	priceLookupKey: string | null,
) {
	return await getPlans(options).then((res) =>
		res?.find(
			(plan) =>
				plan.priceId === priceId ||
				plan.annualDiscountPriceId === priceId ||
				(priceLookupKey &&
					(plan.lookupKey === priceLookupKey ||
						plan.annualDiscountLookupKey === priceLookupKey)),
		),
	);
}

export async function getPlanByName(options: StripeOptions, name: string) {
	return await getPlans(options).then((res) =>
		res?.find((plan) => plan.name.toLowerCase() === name.toLowerCase()),
	);
}
