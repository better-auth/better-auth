export { encodeDeterministicId } from "./adapter/get-id-field";
export {
	type BoundedDatabaseIndexDialect,
	type DatabaseIdStrategy,
	type DBTableIndexSource,
	getDatabaseFieldIndexName,
	getDatabaseIndexName,
	getDatabaseIndexStringLength,
	getPortableDatabaseIdentifierKey,
	type ResolvedDBTableIndex,
	resolveDatabaseSchemaIndexes,
	resolveDatabaseTableIndexes,
	withImplicitIdField,
} from "./database-index";
export { getAuthTablesWithResolvedIndexes } from "./get-tables";
export {
	checksSchema,
	createSchemaCheck,
	invalidateSchemaChecks,
	registerSchemaCheck,
	runtimeSchemaCheckFor,
	type SchemaCheck,
	schemaCheckFor,
} from "./schema-check";
export {
	diffSchema,
	type ExpectedSchema,
	formatSchemaFinding,
	getExpectedSchema,
	type IntrospectedColumn,
	type IntrospectedTable,
	type SchemaFinding,
	SchemaMismatchError,
	type SchemaSource,
} from "./schema-diff";
