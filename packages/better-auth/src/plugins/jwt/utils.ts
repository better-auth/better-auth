import type { AuthContext } from "../../types";
import { BetterAuthError } from "../../error";
import type { jwt } from "./index";

export const getJwtPlugin = (ctx: AuthContext): ReturnType<typeof jwt> => {
	const plugin = ctx.options.plugins?.find((plugin) => plugin.id === "jwt");
	if (!plugin) {
		throw new BetterAuthError("jwt_config", "jwt plugin not found");
	}
	return plugin as ReturnType<typeof jwt>;
};

/**
 *
 * Converts an expirationTime to ISO seconds expiration time (the format of JWT exp)
 *
 * @param expirationTime - see options.jwt.expirationTime
 * @param iat - the iat time to consolidate on
 * @returns
 */
export function toExpJWT(
	expirationTime: number | Date | string,
	iat: number,
): number {
	if (typeof expirationTime === "number") {
		return expirationTime;
	}

	if (expirationTime instanceof Date) {
		return Math.floor(expirationTime.getTime() / 1000);
	}

	const timeSpanRegex =
		/^(-)?\s*(\d+(?:\.\d+)?)\s*(second|seconds|sec|secs|s|minute|minutes|min|mins|m|hour|hours|hr|hrs|h|day|days|d|week|weeks|w|year|years|yr|yrs|y)\s*(ago|from now)?$/i;
	const match = expirationTime.trim().match(timeSpanRegex);

	if (!match) {
		throw new Error(`Invalid time span format: ${expirationTime}`);
	}

	const [, negativePrefix, valueStr, unitRaw, suffix] = match;
	const value = parseFloat(valueStr);
	const unit = unitRaw.toLowerCase();

	const unitSeconds: Record<string, number> = {
		s: 1,
		sec: 1,
		secs: 1,
		second: 1,
		seconds: 1,
		m: 60,
		min: 60,
		mins: 60,
		minute: 60,
		minutes: 60,
		h: 3600,
		hr: 3600,
		hrs: 3600,
		hour: 3600,
		hours: 3600,
		d: 86400,
		day: 86400,
		days: 86400,
		w: 604800,
		week: 604800,
		weeks: 604800,
		y: 31557600,
		yr: 31557600,
		yrs: 31557600,
		year: 31557600,
		years: 31557600, // 365.25 days
	};

	const seconds = unitSeconds[unit];
	if (!seconds) {
		throw new Error(`Unsupported unit: ${unit}`);
	}

	const totalSeconds = value * seconds;
	const isSubtraction = negativePrefix || suffix?.toLowerCase() === "ago";

	return Math.floor(isSubtraction ? iat - totalSeconds : iat + totalSeconds);
}
