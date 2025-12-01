export type DefaultDialects = "mysql" | "sqlite" | "postgresql" | "mssql";

type SharedOptions = {
	/**
	 * @default false
	 */
	useNumberId?: boolean;
	/**
	 * @default "create"
	 */
	mode?: "create" | "alter";
};

export type CopySchemaOptions = SharedOptions & {
	dialect: DefaultDialects | Resolver;
	conditions?: Record<string, boolean>;
};

export type ResolverHandlerContext = Required<SharedOptions> & {
	schema: DBSchema<false>;
};

export type Resolver = {
	/**
	 * @default "sql"
	 */
	language?: "sql" | "typescript" | "prisma";
	handler: (ctx: ResolverHandlerContext) => string;
	controls?: React.ComponentType<{
		id: string;
		setValue: (key: string, value: any) => void;
		values: Record<string, any>;
	}>;
};

type LiteralString = "" | (string & Record<never, never>);
type DBFieldType =
	| "string"
	| "number"
	| "boolean"
	| "date"
	| "json"
	| `${"string" | "number"}[]`
	| Array<LiteralString>;

export type DBFieldAttribute = {
	type: DBFieldType;
	/**
	 * If the field should be required on a new record.
	 * @default true
	 */
	required?: boolean;
	/**
	 * Reference to another model.
	 */
	references?: {
		/**
		 * The model to reference.
		 */
		model: string;
		/**
		 * The field on the referenced model.
		 */
		field: string;
		/**
		 * The action to perform when the reference is deleted.
		 * @default "cascade"
		 */
		onDelete?:
			| "no action"
			| "restrict"
			| "cascade"
			| "set null"
			| "set default";
	};
	unique?: boolean;
	/**
	 * If the field should be a bigint on the database instead of integer.
	 */
	bigint?: boolean;
	/**
	 * The name of the field on the database.
	 */
	fieldName: string;
	/**
	 * If the field should be sortable.
	 *
	 * applicable only for `text` type.
	 * It's useful to mark fields varchar instead of text.
	 */
	sortable?: boolean;
};

export type DBSchema<WithCondition extends boolean = true> = {
	/**
	 * The name of the table in the database
	 */
	modelName: string;
	/**
	 * The fields of the table
	 */
	fields: (DBFieldAttribute &
		(WithCondition extends true
			? {
					condition?: string;
				}
			: {}))[];
};
