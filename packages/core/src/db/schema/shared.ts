import type { DBFieldAttributeConfig, DBFieldAttribute, DBFieldType } from "..";
import { accountSchema } from "./account";
import { rateLimitSchema } from "./rate-limit";
import { sessionSchema } from "./session";
import { userSchema } from "./user";
import { verificationSchema } from "./verification";

export const field = <T extends DBFieldType, C extends DBFieldAttributeConfig<T>>(
	type: T,
	config?: C,
) => {
	return {
		type,
		...config,
	} satisfies DBFieldAttribute<T>;
};


export const coreSchema = {
	id: field("string"),
	createdAt: field("date", { defaultValue: () => new Date() }),
	updatedAt: field("date", { defaultValue: () => new Date() }),
};

export const schema = {
	account: accountSchema,
	user: userSchema,
	session: sessionSchema,
	verification: verificationSchema,
	ratelimit: rateLimitSchema,
};

