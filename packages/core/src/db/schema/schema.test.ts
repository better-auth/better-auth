import { describe, expect, it } from "vitest";
import { accountSchema } from "./account";
import { sessionSchema } from "./session";

describe("database userId fields", () => {
	it("should reject a session without a user id", () => {
		const result = sessionSchema.safeParse({
			id: "session-id",
			expiresAt: new Date("2030-01-01T00:00:00.000Z"),
			token: "session-token",
			ipAddress: null,
			userAgent: null,
		});

		expect(result.success).toBe(false);
	});

	it("should reject an account without a user id", () => {
		const result = accountSchema.safeParse({
			id: "account-id",
			providerId: "credential",
			accountId: "account-id",
		});

		expect(result.success).toBe(false);
	});

	it("should coerce a numeric user id to a string", () => {
		const result = sessionSchema.safeParse({
			id: "session-id",
			userId: 42,
			expiresAt: new Date("2030-01-01T00:00:00.000Z"),
			token: "session-token",
			ipAddress: null,
			userAgent: null,
		});

		expect(result).toMatchObject({
			success: true,
			data: { userId: "42" },
		});
	});
});
