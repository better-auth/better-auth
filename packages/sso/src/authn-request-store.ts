/**
 * AuthnRequest Store
 *
 * Tracks SAML AuthnRequest IDs to enable InResponseTo validation.
 * This prevents:
 * - Unsolicited SAML responses
 * - Cross-provider response injection
 * - Replay attacks
 * - Expired login completions
 */

export interface AuthnRequestRecord {
	id: string;
	providerId: string;
	createdAt: number;
	expiresAt: number;
}

export interface AuthnRequestStore {
	set(record: AuthnRequestRecord): Promise<void>;
	get(id: string): Promise<AuthnRequestRecord | null>;
	delete(id: string): Promise<void>;
}

/**
 * In-memory implementation of AuthnRequestStore.
 * @note Only suitable for testing or single-instance non-serverless deployments.
 * For production, rely on the default behavior (uses verification table)
 * or provide a custom Redis-backed store.
 */
export function createInMemoryAuthnRequestStore(): AuthnRequestStore {
	const store = new Map<string, AuthnRequestRecord>();

	const cleanup = () => {
		const now = Date.now();
		for (const [id, record] of store.entries()) {
			if (record.expiresAt < now) {
				store.delete(id);
			}
		}
	};

	const cleanupInterval = setInterval(cleanup, 60 * 1000);

	if (typeof cleanupInterval.unref === "function") {
		cleanupInterval.unref();
	}

	return {
		async set(record: AuthnRequestRecord): Promise<void> {
			store.set(record.id, record);
		},

		async get(id: string): Promise<AuthnRequestRecord | null> {
			const record = store.get(id);
			if (!record) {
				return null;
			}
			if (record.expiresAt < Date.now()) {
				store.delete(id);
				return null;
			}
			return record;
		},

		async delete(id: string): Promise<void> {
			store.delete(id);
		},
	};
}
