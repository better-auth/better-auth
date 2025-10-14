export type DefaultDialects = "mysql" | "sqlite" | "postgresql" | "mssql";

type SharedOptions = {
	/**
	 * @default false
	 */
	useNumberId?: boolean;
};

export type CopySchemaOptions<S extends DBSchema = DBSchema> = SharedOptions & {
	dialect: DefaultDialects | Resolver;
	conditions?: Partial<Record<InferConditions<S>, boolean>>;
};

export type ResolverContext = Required<SharedOptions> & {
	schema: DBSchema<false>;
};

export type Resolver = (ctx: ResolverContext) => string;

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
	fields: Record<
		string,
		DBFieldAttribute &
			(WithCondition extends true
				? {
						condition?: string;
					}
				: {})
	>;
};

export type InferConditions<T extends DBSchema> = {
	[K in keyof T["fields"]]: T["fields"][K] extends {
		condition: infer C extends string;
	}
		? C
		: never;
}[keyof T["fields"]];
