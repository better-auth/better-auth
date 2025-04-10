import type { BetterAuthPlugin } from "./plugins";
import type {
	FieldAttribute,
	InferFieldsFromPlugins,
	InferFieldsOutput,
} from "../db";

import type {
	LiteralString,
	OmitId,
	PrettifyDeep,
	StripEmptyObjects,
} from "./helper";
import type { betterAuth } from "../auth";
import type { Account, Session, User } from "./models";

export type BetterAuthOptions<
	// Plugin inference
	Plugins extends BetterAuthPlugin[] = BetterAuthPlugin[],
	// User model inference
	UserModelName extends LiteralString = LiteralString,
	UserFields extends Partial<
		Record<keyof OmitId<User>, LiteralString>
	> = Partial<Record<keyof OmitId<User>, LiteralString>>,
	UserAdditionalFields extends {
		[key: string]: FieldAttribute;
	} = {},
	// Session model inference
	SessionModelName extends LiteralString = LiteralString,
	SessionFields extends Partial<
		Record<keyof OmitId<Session>, LiteralString>
	> = Partial<Record<keyof OmitId<Session>, LiteralString>>,
	SessionAdditionalFields extends {
		[key: string]: FieldAttribute;
	} = {},
	// Account model inference
	AccountModelName extends LiteralString = LiteralString,
	AccountFields extends Partial<
		Record<keyof OmitId<Account>, LiteralString>
	> = Partial<Record<keyof OmitId<Account>, LiteralString>>,
> = Parameters<
	typeof betterAuth<
		Plugins,
		UserModelName,
		UserFields,
		UserAdditionalFields,
		SessionModelName,
		SessionFields,
		SessionAdditionalFields,
		AccountModelName,
		AccountFields
	>
>[0];

export type InferDatabaseModel<
	ModelName extends LiteralString,
	BaseModel extends Record<string, any> & { id: unknown },
	Plugins extends BetterAuthPlugin[],
	ModelFields extends Partial<Record<keyof OmitId<BaseModel>, LiteralString>>,
	ModelAdditionalFields extends {
		[key: string]: FieldAttribute;
	},
> = PrettifyDeep<
	ReplaceKeysPartial<
		StripEmptyObjects<
			BaseModel &
				InferFieldsFromPlugins<Plugins, ModelName> &
				(IsOpenRecord<ModelAdditionalFields> extends false
					? InferFieldsOutput<ModelAdditionalFields>
					: {})
		>,
		//@ts-ignore
		ModelFields
	>
>;

type IsOpenRecord<T> = string extends keyof T ? true : false;

type ReplaceKeysPartial<
	T extends Record<string, any>,
	Replacements extends Partial<Record<keyof T, string>>,
> = {
	[K in keyof T as K extends keyof Replacements
		? Replacements[K] extends string // Ensure Replacements[K] is not undefined
			? Replacements[K]
			: K
		: K]: T[K];
};
