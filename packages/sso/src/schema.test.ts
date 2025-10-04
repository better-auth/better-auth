import { describe, it, expect } from "vitest";
import { sso } from "./index";

describe("SSO Schema Extension", () => {
	it("should accept schema options with additional fields", () => {
		const plugin = sso({
			schema: {
				ssoProvider: {
					additionalFields: {
						status: {
							type: "string",
							required: false,
							defaultValue: "active",
						},
						metadata: {
							type: "string",
							required: false,
						},
					},
				},
			},
		});

		expect(plugin.id).toBe("sso");
		expect(plugin.schema).toBeDefined();
		expect(plugin.schema?.ssoProvider).toBeDefined();
	});

	it("should work without schema options", () => {
		const plugin = sso();

		expect(plugin.id).toBe("sso");
		expect(plugin.schema).toBeDefined();
		expect(plugin.schema?.ssoProvider).toBeDefined();
	});

	it("should include base fields in schema", () => {
		const plugin = sso();

		const fields = plugin.schema?.ssoProvider?.fields;
		expect(fields).toBeDefined();
		expect(fields?.issuer).toBeDefined();
		expect(fields?.providerId).toBeDefined();
		expect(fields?.domain).toBeDefined();
		expect(fields?.oidcConfig).toBeDefined();
		expect(fields?.samlConfig).toBeDefined();
		expect(fields?.userId).toBeDefined();
		expect(fields?.organizationId).toBeDefined();
	});

	it("should merge additional fields with base fields", () => {
		const plugin = sso({
			schema: {
				ssoProvider: {
					additionalFields: {
						customField: {
							type: "string",
							required: false,
						},
						anotherField: {
							type: "number",
							required: true,
						},
					},
				},
			},
		});

		const fields = plugin.schema?.ssoProvider?.fields as any;
		expect(fields).toBeDefined();
		
		// Base fields should exist
		expect(fields?.issuer).toBeDefined();
		expect(fields?.providerId).toBeDefined();
		
		// Additional fields should exist
		expect(fields?.customField).toBeDefined();
		expect(fields?.customField?.type).toBe("string");
		expect(fields?.customField?.required).toBe(false);
		
		expect(fields?.anotherField).toBeDefined();
		expect(fields?.anotherField?.type).toBe("number");
		expect(fields?.anotherField?.required).toBe(true);
	});

	it("should support all field attribute types", () => {
		const plugin = sso({
			schema: {
				ssoProvider: {
					additionalFields: {
						stringField: { type: "string" },
						numberField: { type: "number" },
						booleanField: { type: "boolean" },
						dateField: { type: "date" },
					},
				},
			},
		});

		const fields = plugin.schema?.ssoProvider?.fields as any;
		expect(fields?.stringField?.type).toBe("string");
		expect(fields?.numberField?.type).toBe("number");
		expect(fields?.booleanField?.type).toBe("boolean");
		expect(fields?.dateField?.type).toBe("date");
	});

	it("should support field references", () => {
		const plugin = sso({
			schema: {
				ssoProvider: {
					additionalFields: {
						teamId: {
							type: "string",
							required: false,
							references: {
								model: "team",
								field: "id",
							},
						},
					},
				},
			},
		});

		const fields = plugin.schema?.ssoProvider?.fields as any;
		expect(fields?.teamId?.references).toBeDefined();
		expect(fields?.teamId?.references?.model).toBe("team");
		expect(fields?.teamId?.references?.field).toBe("id");
	});

	it("should support field options", () => {
		const plugin = sso({
			schema: {
				ssoProvider: {
					additionalFields: {
						uniqueField: {
							type: "string",
							unique: true,
						},
						fieldWithDefault: {
							type: "string",
							defaultValue: "default-value",
						},
						internalField: {
							type: "string",
							input: false,
						},
						hiddenField: {
							type: "string",
							returned: false,
						},
						customColumnName: {
							type: "string",
							fieldName: "custom_db_column",
						},
					},
				},
			},
		});

		const fields = plugin.schema?.ssoProvider?.fields as any;
		expect(fields?.uniqueField?.unique).toBe(true);
		expect(fields?.fieldWithDefault?.defaultValue).toBe("default-value");
		expect(fields?.internalField?.input).toBe(false);
		expect(fields?.hiddenField?.returned).toBe(false);
		expect(fields?.customColumnName?.fieldName).toBe("custom_db_column");
	});
});
