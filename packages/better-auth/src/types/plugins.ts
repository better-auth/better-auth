import { AuthEndpoint } from "../api/call";
import { FieldAttribute } from "../db/field";
import { LiteralString } from "./helper";

export type Plugin = {
	id: LiteralString;
	endpoints: {
		[key: string]: AuthEndpoint;
	};
	schema?: {
		[key: string]: {
			fields: FieldAttribute;
		};
	};
};
