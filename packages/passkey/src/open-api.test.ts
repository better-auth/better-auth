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
					schema: expect.objectContaining({
						type: "string",
						enum: ["platform", "cross-platform"],
					}),
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

	it("should describe the optional registration session response", async () => {
		const schema = await auth.api.generateOpenAPISchema();
		const paths = schema.paths as Record<string, any>;

		const responseSchema =
			paths["/passkey/verify-registration"].post.responses["200"].content[
				"application/json"
			].schema;
		expect(responseSchema).toEqual({
			type: "object",
			allOf: [
				{ $ref: "#/components/schemas/Passkey" },
				{
					type: "object",
					properties: {
						session: {
							$ref: "#/components/schemas/Session",
						},
						user: {
							$ref: "#/components/schemas/User",
						},
					},
				},
			],
		});
	});
});
