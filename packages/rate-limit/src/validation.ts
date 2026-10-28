import type { RateLimitPolicy } from "./policy";

export function assertRateLimitPolicy(policy: RateLimitPolicy): void {
	switch (policy.strategy) {
		case "fixed-window":
		case "sliding-window-counter":
			assertPositiveInteger("limit", policy.limit);
			assertPositiveInteger("windowMs", policy.windowMs);
			return;
		case "token-bucket":
			assertPositiveInteger("capacity", policy.capacity);
			assertPositiveNumber("refillRate", policy.refillRate);
			assertPositiveInteger("refillIntervalMs", policy.refillIntervalMs);
			return;
		case "gcra":
			assertPositiveInteger("limit", policy.limit);
			assertPositiveInteger("windowMs", policy.windowMs);
			assertPositiveInteger("burst", policy.burst);
			return;
	}
}

export function assertRateLimitCost(cost: number): void {
	assertPositiveInteger("cost", cost);
}

export function assertPositiveInteger(name: string, value: number): void {
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new RangeError(`${name} must be a positive safe integer`);
	}
}

export function assertPositiveNumber(name: string, value: number): void {
	if (!Number.isFinite(value) || value <= 0) {
		throw new RangeError(`${name} must be a positive finite number`);
	}
}
