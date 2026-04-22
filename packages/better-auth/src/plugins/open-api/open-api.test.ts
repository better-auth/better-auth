import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { openAPI } from ".";

describe("open-api", async () => {
	const { auth } = await getTestInstance({
		plugins: [openAPI()],
		user: {
			additionalFields: {
				role: {
					type: "string",
					required: true,
					defaultValue: "user",
				},
				preferences: {
					type: "string",
					required: false,
				},
			},
		},
	});

	it("should generate OpenAPI schema", async () => {
		const schema = await auth.api.generateOpenAPISchema();
		expect(schema).toBeDefined();
		expect(schema).toMatchSnapshot("openAPISchema");
	});

	it("should emit OpenAPI 3.1 by default", async () => {
		const schema = await auth.api.generateOpenAPISchema();
		expect(schema.openapi).toMatch(/^3\.1\./);
	});

	it("should include the User model with id field", async () => {
		const schema = await auth.api.generateOpenAPISchema();
		const schemas = schema.components!.schemas as Record<
			string,
			Record<string, any>
		>;
		expect(schemas["User"]!.properties.id).toEqual({ type: "string" });
	});

	it("should include additionalFields in the User model", async () => {
		const schema = await auth.api.generateOpenAPISchema();
		const schemas = schema.components!.schemas as Record<
			string,
			Record<string, any>
		>;

		expect(schemas["User"]!.properties.role).toEqual({
			type: "string",
			default: "user",
		});
		expect(schemas["User"]!.properties.preferences).toEqual({
			type: "string",
		});
		expect(schemas["User"]!.required).toContain("role");
		expect(schemas["User"]!.required).not.toContain("preferences");
	});

	it("should never emit the deprecated `nullable` keyword in 3.1 output", async () => {
		const schema = await auth.api.generateOpenAPISchema();

		const walk = (value: unknown, path: string): void => {
			if (value === null || typeof value !== "object") return;
			if (Array.isArray(value)) {
				value.forEach((entry, i) => walk(entry, `${path}[${i}]`));
				return;
			}
			for (const [key, child] of Object.entries(
				value as Record<string, unknown>,
			)) {
				if (key === "nullable") {
					throw new Error(
						`Found OAS 3.0 \`nullable\` at ${path}.${key}; OAS 3.1 uses union types instead`,
					);
				}
				walk(child, `${path}.${key}`);
			}
		};

		expect(() => walk(schema, "$")).not.toThrow();
	});
});
