import { describe, expect, expectTypeOf, it } from "vitest";
import type {
	SCIMGroupFilterAttribute,
	SCIMUserFilterAttribute,
} from "./collection-query";
import {
	parseSCIMAttributeProjection,
	parseSCIMCollectionQuery,
} from "./collection-query";

describe("parseSCIMCollectionQuery", () => {
	it("defaults classic pagination to the first page capped at 100 resources", () => {
		const result = parseSCIMCollectionQuery("User", {});

		expect(result).toEqual({
			ok: true,
			value: {
				filters: [],
				pagination: {
					count: 100,
					offset: 0,
					startIndex: 1,
				},
				projection: { mode: "default" },
			},
		});
	});

	it("keeps the filter attribute type specific to the resource", () => {
		const userResult = parseSCIMCollectionQuery("User", {
			filter: 'userName eq "ada@example.com"',
		});
		const groupResult = parseSCIMCollectionQuery("Group", {
			filter: 'displayName eq "Engineering"',
		});

		if (!userResult.ok || !groupResult.ok) {
			throw new Error("expected valid collection queries");
		}
		expectTypeOf(userResult.value.filters[0]?.attribute).toEqualTypeOf<
			SCIMUserFilterAttribute | undefined
		>();
		expectTypeOf(groupResult.value.filters[0]?.attribute).toEqualTypeOf<
			SCIMGroupFilterAttribute | undefined
		>();
	});
});

describe("collection pagination", () => {
	it("normalizes one-based indexes and bounds count to the server maximum", () => {
		expect(
			parseSCIMCollectionQuery("User", {
				startIndex: "0",
				count: "500",
			}),
		).toMatchObject({
			value: { pagination: { startIndex: 1, offset: 0, count: 100 } },
		});
		expect(
			parseSCIMCollectionQuery("User", {
				startIndex: "42",
				count: "25",
			}),
		).toMatchObject({
			value: { pagination: { startIndex: 42, offset: 41, count: 25 } },
		});
		expect(
			parseSCIMCollectionQuery("User", {
				startIndex: -4,
				count: -10,
			}),
		).toMatchObject({
			value: { pagination: { startIndex: 1, offset: 0, count: 0 } },
		});
	});

	it.each([
		["startIndex", "1.5", "invalid-start-index"],
		["startIndex", "next", "invalid-start-index"],
		["count", Number.POSITIVE_INFINITY, "invalid-count"],
		["count", "2e2", "invalid-count"],
	] as const)("returns a typed failure for invalid %s values", (parameter, value, code) => {
		const result = parseSCIMCollectionQuery("User", { [parameter]: value });

		expect(result).toMatchObject({
			ok: false,
			error: { code, parameter, scimType: "invalidValue" },
		});
	});
});

describe("collection filters", () => {
	it.each([
		["ID", "id"],
		["UsErNaMe", "userName"],
		["EXTERNALID", "externalId"],
		["Emails.Value", "emails.value"],
	] as const)("canonicalizes the User %s attribute", (rawAttribute, attribute) => {
		const result = parseSCIMCollectionQuery("User", {
			filter: `${rawAttribute} EQ "value"`,
		});

		expect(result).toMatchObject({
			ok: true,
			value: {
				filters: [{ attribute, operator: "eq", value: "value" }],
			},
		});
	});

	it.each([
		["ID", "id"],
		["DisplayName", "displayName"],
		["EXTERNALID", "externalId"],
	] as const)("canonicalizes the Group %s attribute", (rawAttribute, attribute) => {
		const result = parseSCIMCollectionQuery("Group", {
			filter: `${rawAttribute} eq "value"`,
		});

		expect(result).toMatchObject({
			ok: true,
			value: {
				filters: [{ attribute, operator: "eq", value: "value" }],
			},
		});
	});

	it("decodes quoted and escaped JSON string values", () => {
		const result = parseSCIMCollectionQuery("User", {
			filter: 'UsErNaMe eq "Ada \\"Lovelace\\" \\\\ admin"',
		});

		expect(result).toMatchObject({
			ok: true,
			value: {
				filters: [
					{
						attribute: "userName",
						operator: "eq",
						value: 'Ada "Lovelace" \\ admin',
					},
				],
			},
		});
	});

	it.each([
		["Group", 'userName eq "ada"', "unsupported-filter-attribute"],
		["User", 'userName ne "ada"', "unsupported-filter-operator"],
		["User", "userName pr", "invalid-filter-syntax"],
		["User", "userName eq ada", "invalid-filter-value"],
		["User", 'userName eq "ada" trailing', "invalid-filter-value"],
		["User", "userName eq 7", "invalid-filter-value"],
	] as const)("returns %s filter failures without throwing", (resourceType, filter, code) => {
		const result =
			resourceType === "User"
				? parseSCIMCollectionQuery("User", { filter })
				: parseSCIMCollectionQuery("Group", { filter });

		expect(result).toMatchObject({
			ok: false,
			error: { code, parameter: "filter", scimType: "invalidFilter" },
		});
	});
});

describe("parseSCIMAttributeProjection", () => {
	it("normalizes and de-duplicates included attribute paths", () => {
		const result = parseSCIMAttributeProjection("User", {
			attributes: ["userName, Name.GivenName", "USERNAME"],
		});

		expect(result).toEqual({
			ok: true,
			value: {
				mode: "include",
				attributes: new Set(["username", "name.givenname"]),
			},
		});
	});

	it("normalizes excluded attribute paths", () => {
		const result = parseSCIMAttributeProjection("Group", {
			excludedAttributes: "Members, Meta.Version",
		});

		expect(result).toEqual({
			ok: true,
			value: {
				mode: "exclude",
				excludedAttributes: new Set(["members", "meta.version"]),
			},
		});
	});

	it("rejects simultaneous attributes and excludedAttributes", () => {
		const result = parseSCIMAttributeProjection("User", {
			attributes: "userName",
			excludedAttributes: "emails",
		});

		expect(result).toMatchObject({
			ok: false,
			error: {
				code: "conflicting-attribute-projection",
				parameter: "attributes",
				scimType: "invalidValue",
			},
		});
	});

	it("rejects malformed attribute lists", () => {
		const result = parseSCIMAttributeProjection("User", {
			attributes: "userName,,emails",
		});

		expect(result).toMatchObject({
			ok: false,
			error: {
				code: "invalid-attribute-list",
				parameter: "attributes",
			},
		});
	});
});
