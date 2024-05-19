import type { ZodSchema, z } from "zod";
import type { FieldAttributes, UserInput } from "../adapters/types";
import type { BetterAuthOptions } from "../options";
import type { CustomProvider, Provider, Providers } from "../providers";
import type {
	Flatten,
	FlattenKeys,
	InferType,
	PickNonOptional,
} from "../utils/types";

export interface Actions {
	[key: string]: {
		input?: ZodSchema;
		output?: ZodSchema;
	};
}

export type InferSession<Option extends BetterAuthOptions> =
	Option["user"] extends { fields: infer fields }
		? fields extends {
				[key in infer Key]: FieldAttributes;
			}
			? Flatten<
					{
						user: Flatten<
							{
								[key in Key as fields[key]["returned"] extends false
									? never
									: key]: InferType<fields[key]["type"]>;
							} & {
								id: string;
							}
						>;
					} & {
						expiresAt: Date;
					}
				>
			: never
		: Flatten<{
				user: {
					id: string;
				};
				expiresAt: Date;
			}>;

export type InferProviderSignin<T extends Provider[]> =
	T extends (infer ProviderType)[]
		? {
				[key in ProviderType extends { id: string }
					? ProviderType["id"]
					: never]: Providers[key extends keyof Providers
					? key
					: never] extends {
					input: infer I;
				}
					? {
							input: I;
						}
					: {
							input?: { callbackURL: string };
						};
			}
		: never;

export type InferProviderKeys<T extends Provider[]> =
	T extends (infer ProviderType)[]
		? ProviderType extends Provider
			? ProviderType["id"]
			: never
		: never;

export type InferRegister<
	Option extends BetterAuthOptions,
	P extends Provider,
> = Option extends {
	user: { fields: infer Fields };
}
	? Fields extends {
			[key in infer Key]: FieldAttributes;
		}
		? ({
				[key in Key as Fields[key]["required"] extends false
					? P extends { input: infer Z }
						? Z extends ZodSchema
							? key extends keyof z.infer<Z>
								? key
								: never
							: never
						: never
					: key]: P extends {
					getUserInfo: (tokens: any) => Promise<infer Profile>;
				}
					?
							| FlattenKeys<PickNonOptional<Profile>>
							| {
									value: InferType<Fields[key]["type"]>;
							  }
					: InferType<Fields[Key]["type"]>;
			} & {
				[key in Key as Fields[key]["required"] extends false
					? key
					: P extends { input: infer Z }
						? Z extends ZodSchema
							? key extends keyof z.infer<Z>
								? never
								: key
							: key
						: key]?: P extends {
					getUserInfo: (tokens: any) => Promise<infer Profile>;
				}
					?
							| FlattenKeys<Profile>
							| {
									value: InferType<Fields[key]["type"]>;
							  }
					: InferType<Fields[Key]["type"]>;
			}) &
				(P extends CustomProvider ? UserInput : {})
		: never
	: UserInput;
