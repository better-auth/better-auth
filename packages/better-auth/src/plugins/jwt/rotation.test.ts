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

		// Advance time past rotation interval (and cooldown)
		vi.advanceTimersByTime(5 * 60 * 1000 + 100);

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

		// Trigger rotation (override cooldown to allow rotation)
		await auth.api.rotateKey({ body: { cooldown: 500 } });
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

	it("should respect cooldown period and prevent rapid rotation", async () => {
		vi.useFakeTimers();
		const storage: Jwk[] = [];
		const rotationInterval = 1; // 1 second

		const { auth } = await getTestInstance({
			plugins: [
				jwt({
					jwks: {
						rotationInterval,
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
		expect(storage.length).toBe(1);

		// Advance time past rotation interval (and cooldown)
		vi.advanceTimersByTime(5 * 60 * 1000 + 100);

		// Trigger rotation
		await auth.api.signJWT({ body: { payload: { sub: "user1" } } });
		expect(storage.length).toBe(2);

		// Advance time by 1 second (less than 5 minute cooldown)
		vi.advanceTimersByTime(1000);

		// Try to rotate again - should be blocked by cooldown
		await auth.api.signJWT({ body: { payload: { sub: "user1" } } });
		expect(storage.length).toBe(2); // No new key created

		// Advance time past cooldown (5 minutes + 1 second)
		vi.advanceTimersByTime(5 * 60 * 1000 + 1000);

		// Now rotation should work
		await auth.api.signJWT({ body: { payload: { sub: "user1" } } });
		expect(storage.length).toBe(3);

		vi.useRealTimers();
	});

	it("should not rotate when automatic rotation is disabled", async () => {
		vi.useFakeTimers();
		const storage: Jwk[] = [];

		const { auth } = await getTestInstance({
			plugins: [
				jwt({
					jwks: {
						rotationInterval: 1, // 1 second
						disableAutomaticRotation: true,
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

		// Create initial key manually
		await auth.api.rotateKey({ body: { force: true } });
		expect(storage.length).toBe(1);

		// Advance time past rotation interval
		vi.advanceTimersByTime(1100);

		// Try to sign - should use existing key, not rotate
		await auth.api.signJWT({ body: { payload: { sub: "user1" } } });
		expect(storage.length).toBe(1); // No rotation

		// Check JWKS endpoint - should also not rotate
		await auth.api.getJwks();
		expect(storage.length).toBe(1);

		vi.useRealTimers();
	});

	it("should allow manual rotation via rotateKey endpoint", async () => {
		vi.useFakeTimers();
		const storage: Jwk[] = [];

		const { auth } = await getTestInstance({
			plugins: [
				jwt({
					jwks: {
						disableAutomaticRotation: true,
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

		// Create initial key manually
		const initialResult = await auth.api.rotateKey({ body: { force: true } });
		expect(storage.length).toBe(1);
		const firstKeyId = initialResult.keyId;

		// Manually trigger rotation with force
		const result = await auth.api.rotateKey({
			body: { force: true },
		});

		expect(result.rotated).toBe(true);
		expect(result.keyId).not.toBe(firstKeyId);
		expect(storage.length).toBe(2);

		vi.useRealTimers();
	});

	it("should respect custom cooldown in manual rotation", async () => {
		vi.useFakeTimers();
		const storage: Jwk[] = [];

		const { auth } = await getTestInstance({
			plugins: [
				jwt({
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

		// Create initial key
		await auth.api.signJWT({ body: { payload: { sub: "user1" } } });
		expect(storage.length).toBe(1);

		// Advance time slightly to differentiate keys
		vi.advanceTimersByTime(100);

		// Force first rotation
		const firstRotate = await auth.api.rotateKey({
			body: { force: true },
		});
		expect(firstRotate.rotated).toBe(true);
		expect(storage.length).toBe(2);

		// Advance time slightly (less than cooldown)
		vi.advanceTimersByTime(100);

		// Try to rotate again with custom cooldown - should not rotate (within cooldown)
		const secondRotate = await auth.api.rotateKey({
			body: { cooldown: 10000 }, // 10 seconds
		});
		expect(secondRotate.rotated).toBe(false);
		expect(secondRotate.keyId).toBe(firstRotate.keyId);
		expect(storage.length).toBe(2);

		// Advance past custom cooldown
		vi.advanceTimersByTime(10100);

		// Now rotation should work
		const thirdRotate = await auth.api.rotateKey({
			body: { cooldown: 10000 },
		});
		expect(thirdRotate.rotated).toBe(true);
		expect(thirdRotate.keyId).not.toBe(firstRotate.keyId);
		expect(storage.length).toBe(3);

		vi.useRealTimers();
	});

	it("should force rotation bypassing cooldown", async () => {
		vi.useFakeTimers();
		const storage: Jwk[] = [];

		const { auth } = await getTestInstance({
			plugins: [
				jwt({
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

		// Create initial key
		await auth.api.signJWT({ body: { payload: { sub: "user1" } } });
		expect(storage.length).toBe(1);

		// Force rotate multiple times rapidly
		const firstRotate = await auth.api.rotateKey({
			body: { force: true },
		});
		expect(firstRotate.rotated).toBe(true);

		const secondRotate = await auth.api.rotateKey({
			body: { force: true },
		});
		expect(secondRotate.rotated).toBe(true);
		expect(secondRotate.keyId).not.toBe(firstRotate.keyId);

		const thirdRotate = await auth.api.rotateKey({
			body: { force: true },
		});
		expect(thirdRotate.rotated).toBe(true);
		expect(thirdRotate.keyId).not.toBe(secondRotate.keyId);

		// Should have created 4 keys total (1 initial + 3 forced rotations)
		expect(storage.length).toBe(4);

		vi.useRealTimers();
	});
});
