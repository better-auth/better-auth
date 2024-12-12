import { Entity, Property, Unique } from "@mikro-orm/postgresql";

import { Base } from "./Base";

@Entity()
export class User extends Base {
	@Property({ type: "string" })
	@Unique()
	email!: string;

	@Property({ type: "string" })
	name!: string;

	@Property({ type: "boolean" })
	emailVerified = false;
}
