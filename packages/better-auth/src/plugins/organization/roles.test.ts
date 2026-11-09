import { describe, expect, it } from "vitest";
import { parseRoleList, parseRoles } from "./roles";

describe("parseRoleList", () => {
	it("splits a comma separated string into trimmed roles", () => {
		expect(parseRoleList("admin, owner")).toEqual(["admin", "owner"]);
		expect(parseRoleList(" admin ,owner ")).toEqual(["admin", "owner"]);
		expect(parseRoleList("member")).toEqual(["member"]);
	});

	it("flattens arrays and trims each entry", () => {
		expect(parseRoleList(["admin", " owner "])).toEqual(["admin", "owner"]);
		expect(parseRoleList(["admin, member", "owner"])).toEqual([
			"admin",
			"member",
			"owner",
		]);
	});

	it("drops empty entries", () => {
		expect(parseRoleList("")).toEqual([]);
		expect(parseRoleList(" , ,")).toEqual([]);
		expect(parseRoleList(["", "admin", " "])).toEqual(["admin"]);
	});
});

describe("parseRoles", () => {
	it("stores the normalized comma separated list", () => {
		expect(parseRoles("admin, owner")).toBe("admin,owner");
		expect(parseRoles(["admin", " owner"])).toBe("admin,owner");
		expect(parseRoles("member")).toBe("member");
		expect(parseRoles([])).toBe("");
	});
});
