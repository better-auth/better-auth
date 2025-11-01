import type { BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import type { Jwk } from "./types";

class JwkCreationMutex {
	private locked = false;
	private queue: Array<() => void> = [];

	async acquire(): Promise<void> {
		if (!this.locked) {
			this.locked = true;
			return;
		}

		return new Promise<void>((resolve) => {
			this.queue.push(resolve);
		});
	}

	release(): void {
		const next = this.queue.shift();
		if (next) {
			next();
		} else {
			this.locked = false;
		}
	}

	async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
		await this.acquire();
		try {
			return await fn();
		} finally {
			this.release();
		}
	}
}

const jwkMutex = new JwkCreationMutex();

export const getJwksAdapter = (adapter: DBAdapter<BetterAuthOptions>) => {
	return {
		getAllKeys: async () => {
			return await adapter.findMany<Jwk>({
				model: "jwks",
			});
		},
		getLatestKey: async () => {
			const key = await adapter.findMany<Jwk>({
				model: "jwks",
				sortBy: {
					field: "createdAt",
					direction: "desc",
				},
				limit: 1,
			});

			return key[0];
		},
		createJwk: async (webKey: Omit<Jwk, "id">) => {
			const jwk = await adapter.create<Omit<Jwk, "id">, Jwk>({
				model: "jwks",
				data: {
					...webKey,
					createdAt: new Date(),
				},
			});

			return jwk;
		},
		getOrCreateLatestKey: async (
			createKeyFn: () => Promise<Omit<Jwk, "id">>,
		): Promise<Jwk> => {
			return jwkMutex.runExclusive(async () => {
				const maxRetries = 2;

				for (let attempt = 0; attempt < maxRetries; attempt++) {
					const existingKeys = await adapter.findMany<Jwk>({
						model: "jwks",
						sortBy: {
							field: "createdAt",
							direction: "desc",
						},
						limit: 1,
					});

					if (existingKeys.length > 0) {
						return existingKeys[0]!;
					}

					try {
						const keyData = await createKeyFn();
						const newKey = await adapter.create<Omit<Jwk, "id">, Jwk>({
							model: "jwks",
							data: {
								...keyData,
								createdAt: new Date(),
							},
						});

						return newKey;
					} catch (error) {
						const recheckKeys = await adapter.findMany<Jwk>({
							model: "jwks",
							sortBy: {
								field: "createdAt",
								direction: "desc",
							},
							limit: 1,
						});

						if (recheckKeys.length > 0) {
							return recheckKeys[0]!;
						}

						if (attempt === maxRetries - 1) {
							throw error;
						}

						await new Promise((resolve) => setTimeout(resolve, 50));
					}
				}

				throw new Error("Failed to get or create JWK after maximum retries");
			});
		},
	};
};
