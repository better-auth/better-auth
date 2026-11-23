import type { SecondaryStorage } from "@better-auth/core/db";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it, vi } from "vitest";
import { apiKey } from ".";

describe.each(["database", "secondary-storage"] as const)(
	"API key usage claims in %s mode",
	(storage) => {
		const store = new Map<string, string>();
		const customStorage: SecondaryStorage = {
			get: (key) => store.get(key) ?? null,
			set(key, value) {
				store.set(key, value);
			},
			delete(key) {
				store.delete(key);
			},
			getAndDelete(key) {
				const value = store.get(key) ?? null;
				store.delete(key);
				return value;
			},
			increment(key) {
				const count = Number(store.get(key) ?? 0) + 1;
				store.set(key, String(count));
				return count;
			},
		};

		it("consumes quota only for requests that also claim a rate-limit slot", async () => {
			const { auth, signInWithTestUser } = await getTestInstance({
				plugins: [apiKey({ storage, customStorage })],
			});
			const { headers, user } = await signInWithTestUser();
			const created = await auth.api.createApiKey({
				body: { userId: user.id, remaining: 10, rateLimitMax: 1 },
			});

			const results = await Promise.all(
				Array.from({ length: 6 }, () =>
					auth.api.verifyApiKey({ body: { key: created.key } }),
				),
			);
			expect(results.filter(({ valid }) => valid)).toHaveLength(1);
			expect(
				results.filter(({ error }) => error?.code === "RATE_LIMITED"),
			).toHaveLength(5);

			store.clear();
			const stored = await auth.api.getApiKey({
				headers,
				query: { id: created.id },
			});
			expect(stored).toMatchObject({ remaining: 9, requestCount: 1 });
		});

		it.each([true, false])(
			"preserves lookup and timestamp behavior with rateLimitEnabled=%s and no quota",
			async (rateLimitEnabled) => {
				const { auth, signInWithTestUser } = await getTestInstance({
					plugins: [apiKey({ storage, customStorage })],
				});
				const { user } = await signInWithTestUser();
				const created = await auth.api.createApiKey({
					body: { userId: user.id, rateLimitEnabled },
				});

				const { adapter } = await auth.$context;
				const findOne = vi.spyOn(adapter, "findOne");
				const incrementOne = vi.spyOn(adapter, "incrementOne");
				const update = vi.spyOn(adapter, "update");
				const result = await auth.api.verifyApiKey({
					body: { key: created.key },
				});

				expect(result).toMatchObject({
					valid: true,
					key: {
						id: created.id,
						remaining: null,
						lastRequest: expect.any(Date),
						updatedAt: expect.any(Date),
						requestCount: rateLimitEnabled ? 1 : 0,
					},
				});
				expect(
					findOne.mock.calls.filter(([args]) => args.model === "apikey"),
				).toHaveLength(storage === "database" ? 1 : 0);
				expect(incrementOne).toHaveBeenCalledTimes(1);
				expect(update).not.toHaveBeenCalled();
			},
		);
	},
);
