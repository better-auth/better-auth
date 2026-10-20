import { describe, expect, it } from "vitest";
import {
	compileUserSchemaExtension,
	compileUserSchemaExtensions,
} from "./schema-extensions";

const ACME_URN = "urn:ietf:params:scim:schemas:extension:acme:2.0:User";

describe("compileUserSchemaExtension", () => {
	it("compiles a descriptor shaped like the built-in extensions", () => {
		const descriptor = compileUserSchemaExtension({
			urn: ACME_URN,
			name: "AcmeUser",
			description: "Acme attributes",
			attributes: [
				{ name: "sapUserId", type: "string", mapTo: "sapUserId" },
				{ name: "costCenter", type: "string" },
			],
		});

		expect(descriptor.kind).toBe("extension");
		expect(descriptor.id).toBe(ACME_URN);
		expect(descriptor.required).toBe(false);
		expect(descriptor.canonicalAttribute).toBe(ACME_URN);
		expect(descriptor.responseAttribute).toBe(ACME_URN);
		expect(descriptor.discoverySchema.id).toBe(ACME_URN);
		expect(descriptor.discoverySchema.meta.location).toBe(
			`/scim/v2/Schemas/${ACME_URN}`,
		);
		expect(descriptor.attributes).toEqual([
			{
				name: "sapUserId",
				type: "string",
				required: false,
				returned: "default",
				mapTo: "sapUserId",
			},
			{
				name: "costCenter",
				type: "string",
				required: false,
				returned: "default",
			},
		]);
	});

	it("advertises each attribute through the discovery schema", () => {
		const descriptor = compileUserSchemaExtension({
			urn: ACME_URN,
			name: "AcmeUser",
			attributes: [{ name: "sapUserId", type: "string" }],
		});

		expect(descriptor.discoverySchema.attributes).toEqual([
			{
				name: "sapUserId",
				type: "string",
				multiValued: false,
				description: "",
				required: false,
				caseExact: false,
				mutability: "readWrite",
				returned: "default",
				uniqueness: "none",
			},
		]);
	});

	it("accepts a declared attribute and rejects an undeclared one", () => {
		const descriptor = compileUserSchemaExtension({
			urn: ACME_URN,
			name: "AcmeUser",
			attributes: [{ name: "sapUserId", type: "string" }],
		});

		expect(descriptor.inputSchema.safeParse({ sapUserId: "E-1" }).success).toBe(
			true,
		);
		expect(descriptor.inputSchema.safeParse({ unknownAttr: "x" }).success).toBe(
			false,
		);
	});

	it("unwraps a single-element array for a singular attribute", () => {
		const descriptor = compileUserSchemaExtension({
			urn: ACME_URN,
			name: "AcmeUser",
			attributes: [{ name: "sapUserId", type: "string" }],
		});

		const parsed = descriptor.inputSchema.safeParse({ sapUserId: ["E-1"] });
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data).toEqual({ sapUserId: "E-1" });
		}
	});

	it("rejects a payload missing a required attribute", () => {
		const descriptor = compileUserSchemaExtension({
			urn: ACME_URN,
			name: "AcmeUser",
			attributes: [{ name: "sapUserId", type: "string", required: true }],
		});

		expect(descriptor.inputSchema.safeParse({}).success).toBe(false);
		expect(descriptor.inputSchema.safeParse({ sapUserId: "E-1" }).success).toBe(
			true,
		);
	});

	it("validates each supported scalar type", () => {
		const descriptor = compileUserSchemaExtension({
			urn: ACME_URN,
			name: "AcmeUser",
			attributes: [
				{ name: "flag", type: "boolean" },
				{ name: "count", type: "integer" },
				{ name: "ratio", type: "decimal" },
				{ name: "hiredAt", type: "dateTime" },
				{ name: "manager", type: "reference" },
			],
		});

		expect(
			descriptor.inputSchema.safeParse({
				flag: true,
				count: 3,
				ratio: 1.5,
				hiredAt: "2024-01-01T00:00:00Z",
				manager: "https://example.com/scim/v2/Users/42",
			}).success,
		).toBe(true);
		expect(descriptor.inputSchema.safeParse({ count: 1.5 }).success).toBe(
			false,
		);
		expect(descriptor.inputSchema.safeParse({ flag: "nope" }).success).toBe(
			false,
		);
		expect(
			descriptor.inputSchema.safeParse({ hiredAt: "not-a-date" }).success,
		).toBe(false);
		// Strict RFC 3339: Date.parse would accept this, the SCIM validator must not.
		expect(
			descriptor.inputSchema.safeParse({ hiredAt: "January 1, 2024" }).success,
		).toBe(false);
	});

	it("rejects a reserved built-in schema URN", () => {
		for (const urn of [
			"urn:ietf:params:scim:schemas:core:2.0:User",
			"urn:ietf:params:scim:schemas:extension:enterprise:2.0:User",
			"urn:ietf:params:scim:schemas:core:2.0:Group",
			"urn:ietf:params:scim:schemas:core:2.0:ResourceType",
		]) {
			expect(() =>
				compileUserSchemaExtension({
					urn,
					name: "Nope",
					attributes: [{ name: "x" }],
				}),
			).toThrow(/built-in SCIM schema/);
		}
	});

	it("rejects an empty attribute list", () => {
		expect(() =>
			compileUserSchemaExtension({
				urn: ACME_URN,
				name: "AcmeUser",
				attributes: [],
			}),
		).toThrow(/at least one attribute/);
	});

	it("rejects duplicate and malformed attribute names", () => {
		expect(() =>
			compileUserSchemaExtension({
				urn: ACME_URN,
				name: "AcmeUser",
				attributes: [{ name: "sapUserId" }, { name: "SAPUSERID" }],
			}),
		).toThrow(/declared more than once/);
		expect(() =>
			compileUserSchemaExtension({
				urn: ACME_URN,
				name: "AcmeUser",
				attributes: [{ name: "bad name!" }],
			}),
		).toThrow(/not a valid SCIM name/);
	});
});

describe("compileUserSchemaExtensions", () => {
	it("returns an empty list when nothing is declared", () => {
		expect(compileUserSchemaExtensions(undefined)).toEqual([]);
		expect(compileUserSchemaExtensions([])).toEqual([]);
	});

	it("rejects duplicate schema URNs", () => {
		expect(() =>
			compileUserSchemaExtensions([
				{ urn: ACME_URN, name: "A", attributes: [{ name: "a" }] },
				{ urn: ACME_URN, name: "B", attributes: [{ name: "b" }] },
			]),
		).toThrow(/declared more than once/);
	});

	it("rejects two attributes mapping to the same user field", () => {
		expect(() =>
			compileUserSchemaExtensions([
				{
					urn: ACME_URN,
					name: "A",
					attributes: [{ name: "a", mapTo: "shared" }],
				},
				{
					urn: `${ACME_URN}:2`,
					name: "B",
					attributes: [{ name: "b", mapTo: "shared" }],
				},
			]),
		).toThrow(/already mapped/);
	});

	it("compiles multiple distinct extensions", () => {
		const compiled = compileUserSchemaExtensions([
			{ urn: ACME_URN, name: "A", attributes: [{ name: "a" }] },
			{ urn: `${ACME_URN}:2`, name: "B", attributes: [{ name: "b" }] },
		]);
		expect(compiled.map((descriptor) => descriptor.id)).toEqual([
			ACME_URN,
			`${ACME_URN}:2`,
		]);
	});
});
