import { Entity, Property, ManyToOne, Unique } from "@mikro-orm/postgresql";

import { Base } from "./Base";
import { User } from "./User";

@Entity()
export class Session extends Base {
	@Property({ type: "string" })
	@Unique()
	token!: string;

	@Property({ type: Date })
	expiresAt!: Date;

	@ManyToOne(() => User)
	user!: User;
}
