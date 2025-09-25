import type { StripeOptions, StripeProduct } from "./types";

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

export async function getProducts(
	options: StripeOptions,
): Promise<StripeProduct[]> {
	if (!options.oneTimePayments?.products) return [];

	const products = options.oneTimePayments.products;
	return typeof products === "function" ? await products() : products;
}

export async function getProductByName(
	options: StripeOptions,
	productName: string,
): Promise<StripeProduct | undefined> {
	const products = await getProducts(options);
	return products.find((p) => p.name === productName);
}
