// packages/better-auth/src/adapters/adapter-factory/adapter-factory.id-field.test.ts
import { describe, it, expect } from "vitest";
import { getAuthTables } from "../../db/get-tables";
import { initGetDefaultModelName } from "./get-default-model-name";
import { initGetFieldName } from "./get-field-name";
import { initGetDefaultFieldName } from "./get-default-field-name";
import { createAdapterFactory } from ".";

describe("custom id field mapping", () => {
  it("getAuthTables should include fields.id.fieldName from options", () => {
    const options = {
      user: { fields: { id: "userId" } },
      session: { fields: { id: "sessionId" } },
      account: { fields: { id: "accountId" } },
    } as any;
    const schema = getAuthTables(options);
    expect(schema?.user?.fields.id?.fieldName).toBe("userId");
    expect(schema?.session?.fields.id?.fieldName).toBe("sessionId");
    expect(schema?.account?.fields.id?.fieldName).toBe("accountId");
  });

  it("adapter should store under DB column `user_id` and return logical `id`", async () => {
    const options = { user: { fields: { id: "user_id" } } } as any;

    const factory = createAdapterFactory({
      config: {
        adapterId: "test-adapter",
        adapterName: "Test Adapter",
        usePlural: false,
        debugLogs: false,
        supportsJSON: true,
        supportsDates: true,
        supportsBooleans: true,
      },
      adapter: () => {
        // Simple in-memory backing store for this test
        let stored: any = null;
        return {
          async create(data: { data: any; }) {
            // underlying adapter receives DB-shaped payload in data.data
            stored = data.data;
            return stored;
          },
          async findOne(data: {data: any; where: any;}) {
            // where clause should use DB column names (user_id)
            const where = data.where;
            if (!stored) return null;
            if (where?.user_id && where.user_id === stored.user_id) return stored;
            return null;
          },
        } as any;
      },
    });

    const adapter = factory(options);

    // create a user (logical payload)
    const created = await adapter.create({ model: "user", data: { name: "Alice" } });

    // Underlying store must have used DB column `user_id` (not logical `id`)
    // We verify this by calling findOne using logical id and expecting a result.
    expect(created).toHaveProperty("id");
    const found = await adapter.findOne({ model: "user", where: [{ field: "id", value: created.id }] }) as any;
    expect(found).not.toBeNull();
    expect(found.id).toBe(created.id);
  });

  it("getFieldName should resolve to DB column name for id", () => {
    const options = { user: { fields: { id: "userId" } } } as any;
    const schema = getAuthTables(options);
    const getDefaultModelName = initGetDefaultModelName({
      usePlural: false,
      schema,
    });
    const getFieldName = initGetFieldName({ schema, usePlural: false });

    const modelKey = getDefaultModelName("user"); // should be "user"
    const defaultField = initGetDefaultFieldName({ schema, usePlural: false })({
      model: "user",
      field: "id",
    });
    // DB column name:
    const dbCol = getFieldName({ model: modelKey, field: defaultField });
    expect(dbCol).toBe("userId");
  });
});