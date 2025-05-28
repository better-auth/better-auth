import { describe, expect, it } from "vitest";
import { getAuthTables } from "../../db/get-tables";
import { organization } from "../organization";
import type { BetterAuthOptions } from "../../types";

describe("multi-tenancy schema generation", () => {
	it("should add tenantId to all tables when multi-tenancy is enabled", () => {
		const options: BetterAuthOptions = {
			database: {} as any,
			multiTenancy: {
				enabled: true,
				tenantResolver: () => "tenant-1",
			},
		};

		const tables = getAuthTables(options);

		// Check core tables have tenantId
		expect(tables.user.fields.tenantId).toBeDefined();
		expect(tables.user.fields.tenantId?.type).toBe("string");
		expect(tables.user.fields.tenantId?.required).toBe(true);
		expect(tables.verification.fields.tenantId).toBeDefined();

		// options.multiTenancy.injectIntoSession is not true, so this should not exist
		expect(tables.session.fields.tenantId).toBeUndefined();
	});
	it("should add tenantId session table when injectIntoSession is enabled", () => {
		const options: BetterAuthOptions = {
			database: {} as any,
			multiTenancy: {
				enabled: true,
				tenantResolver: () => "tenant-1",
				injectIntoSession: true,
			},
		};

		const tables = getAuthTables(options);

		expect(tables.session.fields.tenantId).toBeDefined();
	});

	it("should NOT add tenantId when multi-tenancy is disabled", () => {
		const options: BetterAuthOptions = {
			database: {} as any,
			plugins: [organization()],
		};

		const tables = getAuthTables(options);

		// Check core tables do NOT have tenantId
		expect(tables.user.fields.tenantId).toBeUndefined();
		expect(tables.session.fields.tenantId).toBeUndefined();
		expect(tables.verification.fields.tenantId).toBeUndefined();
	});

	it("should use custom field name for tenantId", () => {
		const options: BetterAuthOptions = {
			database: {} as any,
			multiTenancy: {
				enabled: true,
				tenantResolver: () => "tenant-1",
				tableFieldName: "tenant_id",
				injectIntoSession: true,
			},
			plugins: [organization()],
		};

		const tables = getAuthTables(options);

		// Check tenantId field uses custom name
		expect(tables.user.fields.tenantId?.fieldName).toBe("tenant_id");
		expect(tables.session.fields.tenantId?.fieldName).toBe("tenant_id");
		expect(tables.verification.fields.tenantId?.fieldName).toBe("tenant_id");
	});
});
