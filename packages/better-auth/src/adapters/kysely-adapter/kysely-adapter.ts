import { getAuthTables } from "../../db";
import type { Adapter, BetterAuthOptions, Where } from "../../types";
import { generateId } from "../../utils";
import { withApplyDefault } from "../utils";
import type { KyselyDatabaseType } from "./types";
import type { InsertQueryBuilder, Kysely, UpdateQueryBuilder } from "kysely";

interface KyselyAdapterConfig {
  /**
   * Database type.
   */
  type?: KyselyDatabaseType;
}

const createTransform = (
  db: Kysely<any>,
  options: BetterAuthOptions,
  config?: KyselyAdapterConfig,
) => {
  const schema = getAuthTables(options);

  function getField(model: string, field: string) {
    if (field === "id") {
      return field;
    }
    const f = schema[model].fields[field];
    if (!f) {
      console.log("Field not found", model, field);
    }
    return f.fieldName || field;
  }

  function transformValueToDB(value: any, model: string, field: string) {
    const { type = "sqlite" } = config || {};
    const f = schema[model].fields[field];
    if (
      f.type === "boolean" &&
      type === "sqlite" &&
      value !== null &&
      value !== undefined
    ) {
      return value ? 1 : 0;
    }
    if (f.type === "date" && value && value instanceof Date) {
      return type === "sqlite" ? value.toISOString() : value;
    }
    return value;
  }

  function transformValueFromDB(value: any, model: string, field: string) {
    const { type = "sqlite" } = config || {};

    const f = schema[model].fields[field];
    if (f.type === "boolean" && type === "sqlite" && value !== null) {
      return value === 1;
    }
    if (f.type === "date" && value) {
      return new Date(value);
    }
    return value;
  }

  function getModelName(model: string) {
    return schema[model].modelName;
  }

  const useDatabaseGeneratedId = options?.advanced?.generateId === false;
  return {
    transformInput(
      data: Record<string, any>,
      model: string,
      action: "create" | "update",
    ) {
      const transformedData: Record<string, any> =
        useDatabaseGeneratedId || action === "update"
          ? {}
          : {
              id: options.advanced?.generateId
                ? options.advanced.generateId({
                    model,
                  })
                : data.id || generateId(),
            };
      const fields = schema[model].fields;
      for (const field in fields) {
        const value = data[field];
        transformedData[fields[field].fieldName || field] = withApplyDefault(
          transformValueToDB(value, model, field),
          fields[field],
          action,
        );
      }
      return transformedData;
    },
    transformOutput(
      data: Record<string, any>,
      model: string,
      select: string[] = [],
    ) {
      if (!data) return null;
      const transformedData: Record<string, any> = data.id
        ? select.length === 0 || select.includes("id")
          ? {
              id: data.id,
            }
          : {}
        : {};
      const tableSchema = schema[model].fields;
      for (const key in tableSchema) {
        if (select.length && !select.includes(key)) {
          continue;
        }
        const field = tableSchema[key];
        if (field) {
          transformedData[key] = transformValueFromDB(
            data[field.fieldName || key],
            model,
            key,
          );
        }
      }
      return transformedData as any;
    },
    convertWhereClause(model: string, w?: Where[]) {
      if (!w)
        return {
          and: null,
          or: null,
        };

      const conditions = {
        and: [] as any[],
        or: [] as any[],
      };

      w.forEach((condition) => {
        const {
          field: _field,
          value,
          operator = "=",
          connector = "AND",
        } = condition;
        const field = getField(model, _field);
        const expr = (eb: any) => {
          if (operator.toLowerCase() === "in") {
            return eb(field, "in", Array.isArray(value) ? value : [value]);
          }

          if (operator === "contains") {
            return eb(field, "like", `%${value}%`);
          }

          if (operator === "starts_with") {
            return eb(field, "like", `${value}%`);
          }

          if (operator === "ends_with") {
            return eb(field, "like", `%${value}`);
          }

          if (operator === "eq") {
            return eb(field, "=", value);
          }

          if (operator === "ne") {
            return eb(field, "<>", value);
          }

          if (operator === "gt") {
            return eb(field, ">", value);
          }

          if (operator === "gte") {
            return eb(field, ">=", value);
          }

          if (operator === "lt") {
            return eb(field, "<", value);
          }

          if (operator === "lte") {
            return eb(field, "<=", value);
          }

          return eb(field, operator, value);
        };

        if (connector === "OR") {
          conditions.or.push(expr);
        } else {
          conditions.and.push(expr);
        }
      });

      return {
        and: conditions.and.length ? conditions.and : null,
        or: conditions.or.length ? conditions.or : null,
      };
    },
    async withReturning(
      values: Record<string, any>,
      builder:
        | InsertQueryBuilder<any, any, any>
        | UpdateQueryBuilder<any, string, string, any>,
      model: string,
      where: Where[],
    ) {
      let res: any;
      if (config?.type !== "mysql") {
        res = await builder.returningAll().executeTakeFirst();
      } else {
        //this isn't good, but kysely doesn't support returning in mysql and it doesn't return the inserted id. Change this if there is a better way.
        await builder.execute();
        const field = values.id ? "id" : where[0].field ? where[0].field : "id";
        const value = values[field] || where[0].value;
        res = await db
          .selectFrom(getModelName(model))
          .selectAll()
          .where(getField(model, field), "=", value)
          .executeTakeFirst();
      }
      return res;
    },
    getModelName,
    getField,
  };
};

export const kyselyAdapter =
  (db: Kysely<any>, config?: KyselyAdapterConfig) =>
  (opts: BetterAuthOptions) => {
    const {
      transformInput,
      withReturning,
      transformOutput,
      convertWhereClause,
      getModelName,
      getField,
    } = createTransform(db, opts, config);
    return {
      id: "kysely",
      async create(data) {
        const { model, data: values, select } = data;
        const transformed = transformInput(values, model, "create");
        const builder = db.insertInto(getModelName(model)).values(transformed);
        return transformOutput(
          await withReturning(transformed, builder, model, []),
          model,
          select,
        );
      },
      async findOne(data) {
        const { model, where, select } = data;
        const { and, or } = convertWhereClause(model, where);
        let query = db.selectFrom(getModelName(model)).selectAll();
        if (and) {
          query = query.where((eb) => eb.and(and.map((expr) => expr(eb))));
        }
        if (or) {
          query = query.where((eb) => eb.or(or.map((expr) => expr(eb))));
        }
        const res = await query.executeTakeFirst();
        if (!res) return null;
        return transformOutput(res, model, select);
      },
      async findMany(data) {
        const { model, where, limit, offset, sortBy } = data;
        const { and, or } = convertWhereClause(model, where);
        let query = db.selectFrom(getModelName(model));
        if (and) {
          query = query.where((eb) => eb.and(and.map((expr) => expr(eb))));
        }
        if (or) {
          query = query.where((eb) => eb.or(or.map((expr) => expr(eb))));
        }
        query = query.limit(limit || 100);
        if (offset) {
          query = query.offset(offset);
        }
        if (sortBy) {
          query = query.orderBy(
            getField(model, sortBy.field),
            sortBy.direction,
          );
        }
        const res = await query.selectAll().execute();
        if (!res) return [];
        return res.map((r) => transformOutput(r, model));
      },
      async update(data) {
        const { model, where, update: values } = data;
        const { and, or } = convertWhereClause(model, where);
        const transformedData = transformInput(values, model, "update");

        let query = db.updateTable(getModelName(model)).set(transformedData);
        if (and) {
          query = query.where((eb) => eb.and(and.map((expr) => expr(eb))));
        }
        if (or) {
          query = query.where((eb) => eb.or(or.map((expr) => expr(eb))));
        }
        const res = await transformOutput(
          await withReturning(transformedData, query, model, where),
          model,
        );
        return res;
      },
      async updateMany(data) {
        const { model, where, update: values } = data;
        const { and, or } = convertWhereClause(model, where);
        const transformedData = transformInput(values, model, "update");
        let query = db.updateTable(getModelName(model)).set(transformedData);
        if (and) {
          query = query.where((eb) => eb.and(and.map((expr) => expr(eb))));
        }
        if (or) {
          query = query.where((eb) => eb.or(or.map((expr) => expr(eb))));
        }
        const res = await query.execute();
        return res.length;
      },
      async count(data) {
        const { model, where } = data;
        const { and, or } = convertWhereClause(model, where);
        let query = db
          .selectFrom(getModelName(model))
          // a temporal solution for counting other than "*" - see more - https://www.sqlite.org/quirks.html#double_quoted_string_literals_are_accepted
          .select(db.fn.count("id").as("count"));
        if (and) {
          query = query.where((eb) => eb.and(and.map((expr) => expr(eb))));
        }
        if (or) {
          query = query.where((eb) => eb.or(or.map((expr) => expr(eb))));
        }
        const res = await query.execute();
        return res[0].count as number;
      },
      async delete(data) {
        const { model, where } = data;
        const { and, or } = convertWhereClause(model, where);
        let query = db.deleteFrom(getModelName(model));
        if (and) {
          query = query.where((eb) => eb.and(and.map((expr) => expr(eb))));
        }

        if (or) {
          query = query.where((eb) => eb.or(or.map((expr) => expr(eb))));
        }
        await query.execute();
      },
      async deleteMany(data) {
        const { model, where } = data;
        const { and, or } = convertWhereClause(model, where);
        let query = db.deleteFrom(getModelName(model));
        if (and) {
          query = query.where((eb) => eb.and(and.map((expr) => expr(eb))));
        }
        if (or) {
          query = query.where((eb) => eb.or(or.map((expr) => expr(eb))));
        }
        return (await query.execute()).length;
      },
      options: config,
    } satisfies Adapter;
  };
