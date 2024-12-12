import { Property, PrimaryKey } from "@mikro-orm/postgresql";

export abstract class Base {
	@PrimaryKey({ type: "string" })
	readonly id: string = crypto.randomUUID();

	@Property({ type: "datetime" })
	readonly createdAt: Date = new Date();

	@Property({ type: "datetime", onUpdate: () => new Date() })
	readonly updatedAt: Date = new Date();
}
