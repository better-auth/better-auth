import { describe, expect, it } from "vitest";
import type { ImportGroup } from "./imports";
import { createImport, getImportString, groupImports } from "./imports";

describe("Init CLI - imports utility", () => {
	it("should create an import object", () => {
		const import_ = createImport({ name: "username" });
		expect(import_).toEqual({
			name: "username",
			alias: null,
			asType: false,
		});

		const import_withAlias = createImport({ name: "username", alias: "User" });
		expect(import_withAlias).toEqual({
			name: "username",
			alias: "User",
			asType: false,
		});

		const import_withType = createImport({ name: "username", asType: true });
		expect(import_withType).toEqual({
			name: "username",
			alias: null,
			asType: true,
		});

		const import_withAliasAndType = createImport({
			name: "username",
			alias: "User",
			asType: true,
		});
		expect(import_withAliasAndType).toEqual({
			name: "username",
			alias: "User",
			asType: true,
		});
	});

	it("should group imports by path", () => {
		const imports = [
			{
				path: "better-auth/plugins",
				imports: [createImport({ name: "username" })],
				isNamedImport: false,
			},
			{
				path: "better-auth/plugins",
				imports: [createImport({ name: "organization" })],
				isNamedImport: false,
			},
		] satisfies ImportGroup[];
		const result = groupImports(imports);
		expect(result).toEqual([
			{
				path: "better-auth/plugins",
				imports: [
					createImport({ name: "username" }),
					createImport({ name: "organization" }),
				],
				isNamedImport: false,
			},
		]);
	});

	it("should sort named imports to the end", async () => {
		const imports = [
			{
				path: "better-auth/plugins",
				imports: createImport({ name: "test" }),
				isNamedImport: true,
			},
			{
				path: "better-auth",
				imports: [createImport({ name: "betterAuth" })],
				isNamedImport: false,
			},
			{
				path: "better-auth/plugins",
				imports: [createImport({ name: "username" })],
				isNamedImport: false,
			},
		] satisfies ImportGroup[];

		const result = await getImportString(imports);
		const expected = [
			'import { betterAuth } from "better-auth";',
			'import { username } from "better-auth/plugins";',
			'import test from "better-auth/plugins";',
		].join("\n");
		expect(result).toEqual(expected);
	});

	it("should group imports except for named imports", () => {
		const imports = [
			{
				path: "better-auth/plugins",
				imports: [createImport({ name: "username" })],
				isNamedImport: false,
			},
			{
				path: "better-auth/plugins",
				imports: [createImport({ name: "organization" })],
				isNamedImport: false,
			},
			{
				path: "better-auth/plugins",
				imports: createImport({ name: "test" }),
				isNamedImport: true,
			},
		] satisfies ImportGroup[];

		const result = groupImports(imports);
		expect(result).toEqual([
			{
				path: "better-auth/plugins",
				imports: [
					createImport({ name: "username" }),
					createImport({ name: "organization" }),
				],
				isNamedImport: false,
			},
			{
				path: "better-auth/plugins",
				imports: createImport({ name: "test" }),
				isNamedImport: true,
			},
		]);
	});

	it("should get the import string", async () => {
		const imports = [
			{
				path: "better-auth/plugins",
				imports: [createImport({ name: "username" })],
				isNamedImport: false,
			},
		] satisfies ImportGroup[];
		const result = await getImportString(imports);
		expect(result).toEqual('import { username } from "better-auth/plugins";');
	});

	it("should get the import string with named imports", async () => {
		const imports = [
			{
				path: "better-auth/plugins",
				imports: createImport({ name: "username" }),
				isNamedImport: true,
			},
		] satisfies ImportGroup[];
		const result = await getImportString(imports);
		expect(result).toEqual('import username from "better-auth/plugins";');
	});

	it("should get the import string with multiple imports", async () => {
		const imports = [
			{
				path: "better-auth/plugins",
				imports: [
					createImport({ name: "username" }),
					createImport({ name: "organization" }),
				],
				isNamedImport: false,
			},
		] satisfies ImportGroup[];
		const result = await getImportString(imports);
		expect(result).toEqual(
			'import { username, organization } from "better-auth/plugins";',
		);
	});

	it("should get the import string with multiple imports and named imports", async () => {
		const imports = [
			{
				path: "better-auth/plugins",
				imports: [createImport({ name: "username" })],
				isNamedImport: false,
			},
			{
				path: "better-auth/plugins",
				imports: [createImport({ name: "organization" })],
				isNamedImport: false,
			},
			{
				path: "better-auth/plugins",
				imports: createImport({ name: "test" }),
				isNamedImport: true,
			},
		] satisfies ImportGroup[];
		const result = await getImportString(imports);
		const expected = [
			'import { username, organization } from "better-auth/plugins";',
			'import test from "better-auth/plugins";',
		].join("\n");
		expect(result).toEqual(expected);
	});

	it("should get the import string with multiple imports and named imports and multiple paths", async () => {
		const imports = [
			{
				path: "better-auth/plugins",
				imports: [
					createImport({ name: "username" }),
					createImport({ name: "organization" }),
				],
				isNamedImport: false,
			},
			{
				path: "better-auth/client/plugins",
				imports: createImport({ name: "usernameClient" }),
				isNamedImport: true,
			},
		] satisfies ImportGroup[];
		const result = await getImportString(imports);
		const expected = [
			'import { username, organization } from "better-auth/plugins";',
			'import usernameClient from "better-auth/client/plugins";',
		].join("\n");
		expect(result).toEqual(expected);
	});

	it("should get import string with alias and type", async () => {
		const imports = [
			{
				path: "better-auth/plugins",
				imports: [
					createImport({ name: "username", alias: "User", asType: true }),
					createImport({ name: "organization", alias: "Org" }),
					createImport({ name: "Test", asType: true }),
				],
				isNamedImport: false,
			},
		] satisfies ImportGroup[];
		const result = await getImportString(imports);
		const expected = [
			"import {",
			"  type username as User,",
			"  organization as Org,",
			"  type Test,",
			'} from "better-auth/plugins";',
		].join("\n");
		expect(result).toEqual(expected);
	});
});
