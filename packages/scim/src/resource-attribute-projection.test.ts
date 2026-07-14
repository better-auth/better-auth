import { describe, expect, expectTypeOf, it } from "vitest";
import { parseSCIMCollectionQuery } from "./collection-query";
import { projectSCIMResourceAttributes } from "./resource-attribute-projection";

const userResource = {
	schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
	id: "scim-user-1",
	externalId: "directory-user-1",
	userName: "ada@example.com",
	displayName: "Ada Lovelace",
	name: {
		formatted: "Ada Lovelace",
		givenName: "Ada",
		familyName: "Lovelace",
	},
	emails: [
		{ value: "ada@example.com", primary: true, type: "work" },
		{ primary: false, type: "other" },
	],
	meta: {
		resourceType: "User",
		location: "https://example.com/scim/v2/Users/scim-user-1",
		version: "v1",
	},
};

describe("projectSCIMResourceAttributes", () => {
	it("preserves schemas and id for an included attribute projection", () => {
		const resource = {
			schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
			id: "scim-user-1",
			userName: "ada@example.com",
			displayName: "Ada Lovelace",
		};

		expect(
			projectSCIMResourceAttributes(resource, {
				mode: "include",
				attributes: new Set(["displayname"]),
			}),
		).toEqual({
			schemas: resource.schemas,
			id: resource.id,
			displayName: "Ada Lovelace",
		});
	});

	it("returns a shallow copy for the default projection", () => {
		const projected = projectSCIMResourceAttributes(userResource, {
			mode: "default",
		});

		expect(projected).toEqual(userResource);
		expect(projected).not.toBe(userResource);
	});

	it("preserves mandatory attributes even when excluded explicitly", () => {
		const projected = projectSCIMResourceAttributes(userResource, {
			mode: "exclude",
			excludedAttributes: new Set(["schemas", "id", "displayname"]),
		});

		expect(projected.schemas).toEqual(userResource.schemas);
		expect(projected.id).toBe(userResource.id);
		expect(projected).not.toHaveProperty("displayName");
	});

	it("includes dotted object and multi-valued subattributes", () => {
		const projected = projectSCIMResourceAttributes(userResource, {
			mode: "include",
			attributes: new Set(["name.givenname", "emails.value", "meta.location"]),
		});

		expect(projected).toEqual({
			schemas: userResource.schemas,
			id: userResource.id,
			name: { givenName: "Ada" },
			emails: [{ value: "ada@example.com" }],
			meta: {
				location: "https://example.com/scim/v2/Users/scim-user-1",
			},
		});
	});

	it("excludes dotted attributes while preserving sibling values", () => {
		const projected = projectSCIMResourceAttributes(userResource, {
			mode: "exclude",
			excludedAttributes: new Set([
				"name.formatted",
				"emails.value",
				"meta.location",
			]),
		});

		expect(projected.name).toEqual({
			givenName: "Ada",
			familyName: "Lovelace",
		});
		expect(projected.emails).toEqual([
			{ primary: true, type: "work" },
			{ primary: false, type: "other" },
		]);
		expect(projected.meta).toEqual({ resourceType: "User", version: "v1" });
		expect(userResource.emails[0]).toHaveProperty("value", "ada@example.com");
	});

	it("treats a selected top-level attribute as the complete value", () => {
		const projected = projectSCIMResourceAttributes(userResource, {
			mode: "include",
			attributes: new Set(["name", "name.givenname"]),
		});

		expect(projected.name).toEqual(userResource.name);
	});

	it("matches resource key spelling case-insensitively", () => {
		const projected = projectSCIMResourceAttributes(userResource, {
			mode: "include",
			attributes: new Set(["USERNAME", "NAME.FAMILYNAME"]),
		});

		expect(projected).toMatchObject({
			userName: "ada@example.com",
			name: { familyName: "Lovelace" },
		});
	});

	it("accepts projection output directly from the collection query parser", () => {
		const query = parseSCIMCollectionQuery("User", {
			attributes: "userName,name.givenName",
		});
		if (!query.ok) throw new Error(query.error.detail);

		const projected = projectSCIMResourceAttributes(
			userResource,
			query.value.projection,
		);

		expect(projected).toEqual({
			schemas: userResource.schemas,
			id: userResource.id,
			userName: "ada@example.com",
			name: { givenName: "Ada" },
		});
	});

	it("retains mandatory fields in the projected result type", () => {
		const projected = projectSCIMResourceAttributes(userResource, {
			mode: "include",
			attributes: new Set(),
		});

		expectTypeOf(projected.id).toEqualTypeOf<string>();
		expectTypeOf(projected.schemas).toEqualTypeOf<string[]>();
		expectTypeOf(projected.userName).toEqualTypeOf<string | undefined>();
	});
});
