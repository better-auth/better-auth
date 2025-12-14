import type { ReadonlyURLSearchParams } from "next/navigation";

const allowedCallbackSet: ReadonlySet<string> = new Set([
	"/dashboard",
	"/device",
]);

export const getCallbackURL = (
	queryParams: ReadonlyURLSearchParams,
): string => {
	const callbackUrl = queryParams.get("callbackUrl");
	if (callbackUrl) {
		if (allowedCallbackSet.has(callbackUrl)) {
			return callbackUrl;
		}
		return "/dashboard";
	}
	return "/dashboard";
};
