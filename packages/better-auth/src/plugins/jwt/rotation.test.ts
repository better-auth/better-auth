import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { jwt } from ".";
import type { Jwk } from "./types";

describe("jwt rotation", async () => {
	it("should rotate keys when expired", async () => {
		vi.useFakeTimers();
		const storage: Jwk[] = [];
		const { auth } = await getTestInstance({
			plugins: [
				jwt({
					jwks: {
						rotationInterval: 1, // 1 second
					},
					adapter: {
						getJwks: async () => storage,
						createJwk: async (data) => {
							const key = {
								...data,
								id: crypto.randomUUID(),
							};
							storage.push(key);
							return key;
						},
					},
				}),
			],
		});

		// First key creation
		await auth.api.signJWT({
			body: { payload: { sub: "user1" } },
		});
		expect(storage.length).toBe(1);
		const firstKey = storage[0];

		// Advance time past rotation interval
		vi.advanceTimersByTime(1100);

		// Second key creation (should rotate)
		await auth.api.signJWT({
			body: { payload: { sub: "user1" } },
		});
		expect(storage.length).toBe(2);
		const secondKey = storage[1];
		expect(secondKey!.id).not.toBe(firstKey!.id);

		vi.useRealTimers();
	});

	it("should return keys within grace period", async () => {
		vi.useFakeTimers();
		const storage: Jwk[] = [];
		const rotationInterval = 1; // 1 second
		const gracePeriod = 1; // 1 second

		const { auth } = await getTestInstance({
			plugins: [
				jwt({
					jwks: {
						rotationInterval,
						gracePeriod,
					},
					adapter: {
						getJwks: async () => storage,
						createJwk: async (data) => {
							const key = {
								...data,
								id: crypto.randomUUID(),
							};
							storage.push(key);
							return key;
						},
					},
				}),
			],
		});

		// Create first key
		await auth.api.signJWT({ body: { payload: { sub: "user1" } } });

		// Advance time past rotation interval but within grace period
		vi.advanceTimersByTime(1100);

		// Trigger rotation by signing
		await auth.api.signJWT({ body: { payload: { sub: "user1" } } });
		expect(storage.length).toBe(2);

		// Check JWKS endpoint
		const jwks = await auth.api.getJwks();
		expect(jwks.keys.length).toBe(2); // Both keys should be present

		// Advance time past grace period
		vi.advanceTimersByTime(1000);

		const jwksAfterGrace = await auth.api.getJwks();
		expect(jwksAfterGrace.keys.length).toBe(1); // First key should be gone
		expect(jwksAfterGrace.keys[0]?.kid).toBe(storage[1]!.id);

		vi.useRealTimers();
	});
});
