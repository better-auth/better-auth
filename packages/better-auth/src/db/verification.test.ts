import type { GenericEndpointContext } from "@better-auth/core";
import { createPool } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";
import { createOrFindVerification } from "./verification";

let isMysqlAvailable = false;
try {
	const probe = createPool({
		uri: "mysql://root:root_password@127.0.0.1:3306",
		connectTimeout: 2000,
	});
	await probe.query("SELECT 1");
	await probe.end();
	isMysqlAvailable = true;
} catch {
	isMysqlAvailable = false;
}

describe("createOrFindVerification", () => {
	it("keeps the id from a custom id strategy", async () => {
		const { auth } = await getTestInstance({
			advanced: {
				database: { generateId: () => `custom-${crypto.randomUUID()}` },
			},
		});
		const ctx = { context: await auth.$context } as GenericEndpointContext;

		const created = await createOrFindVerification(ctx, {
			identifier: "sign-in-otp-custom@example.com",
			value: "code",
			expiresAt: new Date(Date.now() + 60_000),
		});

		expect(created?.id).toMatch(/^custom-/);
	});
});

describe.runIf(isMysqlAvailable || Boolean(process.env.CI))(
	"createOrFindVerification with MySQL",
	() => {
		it("fits the derived id in the varchar(36) id column", async () => {
			const { auth } = await getTestInstance(undefined, { testWith: "mysql" });
			const ctx = { context: await auth.$context } as GenericEndpointContext;
			const data = {
				identifier: "sign-in-otp-mysql@example.com",
				value: "first",
				expiresAt: new Date(Date.now() + 60_000),
			};

			const created = await createOrFindVerification(ctx, data);
			const found = await createOrFindVerification(ctx, {
				...data,
				value: "second",
			});

			expect(created?.value).toBe("first");
			expect(found?.value).toBe("first");
		});
	},
);
