export {
	type BoundedDatabaseIndexDialect,
	type DBTableIndexSource,
	getDatabaseFieldIndexName,
	getDatabaseIndexName,
	getDatabaseIndexStringLength,
	getPortableDatabaseIdentifierKey,
	type ResolvedDBTableIndex,
	resolveDatabaseSchemaIndexes,
	resolveDatabaseTableIndexes,
} from "./database-index";
export { getAuthTablesWithResolvedIndexes } from "./get-tables";
export {
	checksSchema,
	createSchemaCheck,
	invalidateSchemaChecks,
	registerSchemaCheck,
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
