import { openAPI } from "better-auth/plugins";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { passkey } from ".";

describe("passkey open-api", async () => {
	const { auth } = await getTestInstance({
		plugins: [passkey(), openAPI()],
	});

	it("should place passkey query parameters at the operation level", async () => {
		const schema = await auth.api.generateOpenAPISchema();
		const paths = schema.paths as Record<string, any>;

		const operation = paths["/passkey/generate-register-options"].get;
		expect(operation.parameters).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "authenticatorAttachment",
					in: "query",
					required: false,
				}),
				expect.objectContaining({
					name: "name",
					in: "query",
					required: false,
				}),
				expect.objectContaining({
					name: "context",
					in: "query",
					required: false,
				}),
			]),
		);
		expect(operation.responses["200"].parameters).toBeUndefined();
	});
});
