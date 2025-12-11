import { describe, expect, it } from "vitest";
import {
	createInMemoryAuthnRequestStore,
	DEFAULT_AUTHN_REQUEST_TTL_MS,
} from "./authn-request-store";

describe("AuthnRequest Store", () => {
	describe("In-Memory Store", () => {
		it("should save and retrieve an AuthnRequest record", async () => {
			const store = createInMemoryAuthnRequestStore();

			const record = {
				id: "_test-request-id-1",
				providerId: "saml-provider-1",
				createdAt: Date.now(),
				expiresAt: Date.now() + DEFAULT_AUTHN_REQUEST_TTL_MS,
			};

			await store.save(record);
			const retrieved = await store.get(record.id);

			expect(retrieved).toEqual(record);
		});

		it("should return null for non-existent request ID", async () => {
			const store = createInMemoryAuthnRequestStore();

			const retrieved = await store.get("_non-existent-id");

			expect(retrieved).toBeNull();
		});

		it("should return null for expired request ID", async () => {
			const store = createInMemoryAuthnRequestStore();

			const record = {
				id: "_expired-request-id",
				providerId: "saml-provider-1",
				createdAt: Date.now() - 10000,
				expiresAt: Date.now() - 1000, // Already expired
			};

			await store.save(record);
			const retrieved = await store.get(record.id);

			expect(retrieved).toBeNull();
		});

		it("should delete a request ID", async () => {
			const store = createInMemoryAuthnRequestStore();

			const record = {
				id: "_delete-me",
				providerId: "saml-provider-1",
				createdAt: Date.now(),
				expiresAt: Date.now() + DEFAULT_AUTHN_REQUEST_TTL_MS,
			};

			await store.save(record);
			await store.delete(record.id);

			const retrieved = await store.get(record.id);
			expect(retrieved).toBeNull();
		});

		it("should handle multiple providers with different request IDs", async () => {
			const store = createInMemoryAuthnRequestStore();

			const record1 = {
				id: "_request-provider-1",
				providerId: "saml-provider-1",
				createdAt: Date.now(),
				expiresAt: Date.now() + DEFAULT_AUTHN_REQUEST_TTL_MS,
			};

			const record2 = {
				id: "_request-provider-2",
				providerId: "saml-provider-2",
				createdAt: Date.now(),
				expiresAt: Date.now() + DEFAULT_AUTHN_REQUEST_TTL_MS,
			};

			await store.save(record1);
			await store.save(record2);

			const retrieved1 = await store.get(record1.id);
			const retrieved2 = await store.get(record2.id);

			expect(retrieved1?.providerId).toBe("saml-provider-1");
			expect(retrieved2?.providerId).toBe("saml-provider-2");
		});
	});

	describe("DEFAULT_AUTHN_REQUEST_TTL_MS", () => {
		it("should be 5 minutes in milliseconds", () => {
			expect(DEFAULT_AUTHN_REQUEST_TTL_MS).toBe(5 * 60 * 1000);
		});
	});
});
