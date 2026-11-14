export { isAPIError } from "@better-auth/core/utils/is-api-error";

export const getDate = (span: number, unit: "sec" | "ms" = "ms") => {
	return new Date(Date.now() + (unit === "sec" ? span * 1000 : span));
};
