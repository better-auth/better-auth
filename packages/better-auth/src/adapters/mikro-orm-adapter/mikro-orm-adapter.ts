import type {
	EntityMetadata,
	EntityProperty,
	FindOptions,
	MikroORM,
} from "@mikro-orm/core";
import { serialize, ReferenceKind } from "@mikro-orm/core";
import { dset } from "dset";

import { generateId } from "../../utils";
import { BetterAuthError } from "../../error";
import type { Adapter, BetterAuthOptions, Where } from "../../types";

function createAdapterError(message: string): never {
	throw new BetterAuthError(`Mikro ORM Adapter: ${message}`);
}

function createUtils(orm: MikroORM) {
	const naming = orm.config.getNamingStrategy();
	const metadata = orm.getMetadata();

	/**
	 * Normalizes given model `name` for Mikro ORM using [naming strategy](https://mikro-orm.io/docs/naming-strategy) defined by the config.
	 *
	 * @param name - The name of the entity
	 */
	const normalizeEntityName = (name: string) =>
		naming.getEntityName(naming.classToTableName(name));

	/**
	 * Returns metadata for given `entityName` from MetadataStorage.
	 *
	 * @param entityName - The name of the entity to get the metadata for
	 *
	 * @throws BetterAuthError when no metadata found
	 */
	function getEntityMetadata(entityName: string) {
		if (!metadata.has(entityName)) {
			createAdapterError(
				`Cannot find metadata for "${entityName}" entity. Make sure it defined and listed in your Mikro ORM config.`,
			);
		}

		return metadata.get(entityName);
	}

	/**
	 * Returns metadata for a property by given `fieldName`.
	 *
	 * @param metadata - Entity metadata
	 * @param fieldName - The name of the field to get metadata for
	 */
	function getPropertyMetadata(
		metadata: EntityMetadata,
		fieldName: string,
	): EntityProperty {
		const prop = metadata.props.find((prop) => {
			if (prop.kind === ReferenceKind.SCALAR && prop.name === fieldName) {
				return true;
			}

			if (
				(prop.kind === ReferenceKind.MANY_TO_ONE && prop.name === fieldName) ||
				prop.fieldNames.includes(naming.propertyToColumnName(fieldName))
			) {
				return true;
			}

			return false;
		});

		if (!prop) {
			createAdapterError(
				`Can't find property "${fieldName}" on entity "${metadata.className}".`,
			);
		}

		return prop;
	}

	/**
	 * Returns referenced _column_ name for given `prop` using [naming strategy](https://mikro-orm.io/docs/naming-strategy) defined by the config.
	 *
	 * @param entityName - The name of the entity
	 * @param prop - Property metadata
	 */
	function getReferencedColumnName(entityName: string, prop: EntityProperty) {
		if (prop.kind === ReferenceKind.SCALAR) {
			return prop.name;
		}

		if (prop.kind === ReferenceKind.MANY_TO_ONE) {
			return naming.joinColumnName(prop.name);
		}

		createAdapterError(
			`Reference kind ${prop.kind} is not supported. Defined in "${entityName}" entity for "${prop.name}" field.`,
		);
	}

	/**
	 * Returns referenced _property_ name in camelCase.
	 *
	 * @param entityName - The name of the entity
	 * @param prop - Property metadata
	 */
	const getReferencedPropertyName = (
		entityName: string,
		prop: EntityProperty,
	) => naming.columnNameToProperty(getReferencedColumnName(entityName, prop));

	/**
	 * Returns a path to a `field` reference.
	 *
	 * @param orm - Mikro ORM instance
	 * @param entityName - The name of the entity
	 * @param fieldName - The field's name
	 * @param throwOnShadowProps - Whether or throw error for Shadow Props. Use it for where clause so Mikro ORM will not throw when accessing such props from database.
	 *
	 * @throws BetterAuthError when no such field exist on the `entity`
	 * @throws BetterAuthError if complex primary key is discovered in `fieldName` relation
	 */
	function getFieldPath(
		entityName: string,
		fieldName: string,
		throwOnShadowProps = false,
	): string[] {
		const metadata = getEntityMetadata(entityName);
		const prop = getPropertyMetadata(metadata, fieldName);

		if (prop.persist === false && throwOnShadowProps) {
			createAdapterError(
				`Cannot serialize "${fieldName}" into path, because it cannot be persisted in "${metadata.tableName}" table.`,
			);
		}

		if (prop.kind === ReferenceKind.SCALAR) {
			return [prop.name];
		}

		if (prop.kind === ReferenceKind.MANY_TO_ONE) {
			if (prop.referencedPKs.length > 1) {
				createAdapterError(
					`The "${fieldName}" field references to a table "${prop.name}" with complex primary key, which is not supported`,
				);
			}

			return [prop.name, naming.referenceColumnName()];
		}

		createAdapterError(
			`Cannot normalize "${fieldName}" field name into path for "${entityName} entity."`,
		);
	}

	/**
	 * Normalized Better Auth data for Mikro ORM.
	 *
	 * @param entityName - The name of the entity
	 * @param input - The data to normalize
	 */
	function normalizeInput<T extends Record<string, any>>(
		entityName: string,
		input: T,
	) {
		const fields: Record<string, any> = {};
		Object.entries(input).forEach(([key, value]) => {
			const path = getFieldPath(entityName, key);
			dset(fields, path, value);
		});

		return fields;
	}

	/**
	 * Normalizes the Mikro ORM output for Better Auth.
	 *
	 * @param entityName - The name of the entity
	 * @param output - The result of a Mikro ORM query
	 */
	function normalizeOutput(
		entityName: string,
		output: Record<string, any>,
		select?: string[],
	) {
		const metadata = getEntityMetadata(entityName);
		output = serialize(output);

		const result: Record<string, any> = {};
		Object.entries(output)
			.map(([key, value]) => ({
				path: getReferencedPropertyName(
					entityName,
					getPropertyMetadata(metadata, key),
				),
				value,
			}))
			.filter(({ path }) => (select ? select.includes(path) : true))
			.forEach(({ path, value }) => dset(result, path, value));

		return result;
	}

	/**
	 * Creates a `where` clause with given params.
	 *
	 * @param fieldName - The name of the field
	 * @param path - Path to the field reference
	 * @param value - Field's value
	 * @param op - Query operator
	 * @param target - Target object to assign the result to. The object will be *mutated*
	 */
	function createWhereClause(
		path: Array<string | number>,
		value: unknown,
		op?: string,
		target: Record<string, any> = {},
	): Record<string, any> {
		dset(target, op == null || op === "eq" ? path : path.concat(op), value);

		return target;
	}

	/**
	 * Same as `createWhereClause`, but creates a statement with only `$in` operator and check if the `value` is an array.
	 *
	 * @param fieldName - The name of the field
	 * @param path - Path to the field reference
	 * @param value - Field's value
	 * @param target - Target object to assign the result to. The object will be *mutated*
	 */
	function createWhereInClause(
		fieldName: string,
		path: Array<string | number>,
		value: unknown,
		target?: Record<string, any>,
	): Record<string, any> {
		if (!Array.isArray(value)) {
			createAdapterError(
				`The value for the field "${fieldName}" must be an array when using the $in operator.`,
			);
		}

		return createWhereClause(path, value, "$in", target);
	}

	/**
	 * Transfroms hiven list of Where clause(s) for Mikro ORM.
	 *
	 * @param entityName - Entity name
	 * @param where - A list where clause(s) to normalize
	 */
	function normalizeWhereClauses(
		entityName: string,
		where?: Where[],
	): Record<string, any> {
		if (!where) {
			return {};
		}

		if (where.length === 1) {
			const [w] = where;

			if (!w) {
				return {};
			}

			const path = getFieldPath(entityName, w.field, true);

			if (w.operator === "in") {
				return createWhereInClause(w.field, path, w.value);
			}

			switch (w.operator) {
				case "contains":
					return createWhereClause(path, `%${w.value}%`, "$like");
				case "starts_with":
					return createWhereClause(path, `${w.value}%`, "$like");
				case "ends_with":
					return createWhereClause(path, `%${w.value}`, "$like");
				// The next 5 case statemets are _expected_ to fall through so we can simplify and reuse the same logic for these operators
				case "gt":
				case "gte":
				case "lt":
				case "lte":
				case "ne":
					return createWhereClause(path, w.value, `$${w.operator}`);
				default:
					return createWhereClause(path, w.value);
			}
		}

		const result: Record<string, any> = {};

		where
			.filter(({ connector }) => !connector || connector === "AND")
			.forEach(({ field, operator, value }, index) => {
				const path = ["$and", index].concat(
					getFieldPath(entityName, field, true),
				);

				if (operator === "in") {
					return createWhereInClause(field, path, value, result);
				}

				return createWhereClause(path, value, "eq", result);
			});

		where
			.filter(({ connector }) => connector === "OR")
			.forEach(({ field, value }, index) => {
				const path = ["$and", index].concat(
					getFieldPath(entityName, field, true),
				);

				return createWhereClause(path, value, "eq", result);
			});

		return result;
	}

	return {
		normalizeEntityName,
		getFieldPath,
		normalizeInput,
		normalizeOutput,
		normalizeWhereClauses,
	} as const;
}

/**
 * Creates Mikro ORM adapter for Better Auth.
 *
 * Current limitations:
 *   * No m:m and 1:m and embedded references support
 *   * No complex primary key support
 *
 * @param orm - Instance of Mikro ORM returned from `MikroORM.init` or `MikroORM.initSync` methods
 */
export function mikroOrmAdapter(orm: MikroORM) {
	const {
		normalizeEntityName,
		getFieldPath,
		normalizeInput,
		normalizeOutput,
		normalizeWhereClauses,
	} = createUtils(orm);

	const adapter = (options: BetterAuthOptions): Adapter => ({
		id: "mikro-orm",
		async create({ model, data, select }) {
			const entityName = normalizeEntityName(model);

			const input = normalizeInput(entityName, data);

			if (options.advanced?.generateId !== false) {
				input.id =
					typeof options.advanced?.generateId === "function"
						? options.advanced.generateId({ model })
						: generateId();
			}

			const entity = orm.em.create(entityName, input);

			await orm.em.persistAndFlush(entity);

			return normalizeOutput(entityName, entity, select) as any;
		},
		async findOne({ model: entityName, where, select }) {
			entityName = normalizeEntityName(entityName);

			const entity = await orm.em.findOne(
				entityName,
				normalizeWhereClauses(entityName, where),
			);

			if (!entity) {
				return null;
			}

			return normalizeOutput(entityName, entity, select) as any;
		},
		async findMany({ model: entityName, where, limit, offset, sortBy }) {
			entityName = normalizeEntityName(entityName);

			const options: FindOptions<any> = {
				limit,
				offset,
			};

			if (sortBy) {
				const path = getFieldPath(entityName, sortBy.field);
				dset(options, ["orderBy", ...path], sortBy.direction);
			}

			const rows = await orm.em.find(
				entityName,
				normalizeWhereClauses(entityName, where),
				options,
			);

			return rows.map((row) => normalizeOutput(entityName, row)) as any;
		},
		async update({ model: entityName, where, update }) {
			entityName = normalizeEntityName(entityName);

			const entity = await orm.em.findOne(
				entityName,
				normalizeWhereClauses(entityName, where),
			);

			if (!entity) {
				return null;
			}

			orm.em.assign(entity, normalizeInput(entityName, update));
			await orm.em.flush();

			return normalizeOutput(entityName, entity) as any;
		},
		async updateMany({ model: entityName, where, update }) {
			entityName = normalizeEntityName(entityName);

			const affected = await orm.em.nativeUpdate(
				entityName,
				normalizeWhereClauses(entityName, where),
				normalizeInput(entityName, update),
			);

			orm.em.clear();

			return affected;
		},
		async delete({ model: entityName, where }) {
			entityName = normalizeEntityName(entityName);

			const entity = await orm.em.findOne(
				entityName,
				normalizeWhereClauses(entityName, where),
			);

			if (entity) {
				await orm.em.removeAndFlush(entity);
			}
		},
		async deleteMany({ model: entityName, where }) {
			entityName = normalizeEntityName(entityName);

			const affected = await orm.em.nativeDelete(
				entityName,
				normalizeWhereClauses(entityName, where),
			);

			orm.em.clear(); // This clears the IdentityMap

			return affected;
		},
	});

	return adapter;
}
