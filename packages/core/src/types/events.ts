import type { Session, User } from "../db";
import type { UnionToIntersection } from "./helper";
import type { BetterAuthOptions } from "./init-options";
import type { BetterAuthPlugin } from "./plugin";

export type EventsMap = {
	[event: string]: any;
};

export type DefaultEventsMap = {
	signUp: (session: {
		session: Session & Record<string, any>;
		user: User & Record<string, any>;
	}) => void;
	signIn: (session: {
		session: Session & Record<string, any>;
		user: User & Record<string, any>;
	}) => void;
	signOut: (user?: (User & Record<string, any>) | undefined) => void;
	passwordReset: (userId: string) => void;
	verifyEmail: (user: User & Record<string, any>) => void;
};

export type UnsubscribeEvent = () => void;

type InferEvents<E extends EventsMap> = E & DefaultEventsMap;
export type EventMixin<Events extends EventsMap = Record<string, any>> = {
	on<K extends keyof InferEvents<Events>>(
		event: K,
		cb: InferEvents<Events>[K],
	): UnsubscribeEvent;
};
export type EventEmitter<Events extends EventsMap = Record<string, any>> = {
	events: Partial<{
		[E in keyof InferEvents<Events>]: InferEvents<Events>[E][];
	}>;
	emit<K extends keyof InferEvents<Events>>(
		event: K,
		...args: Parameters<InferEvents<Events>[K]>
	): void;
} & EventMixin<Events>;

export type InferPluginEvents<O extends BetterAuthOptions> =
	O["plugins"] extends Array<infer P>
		? UnionToIntersection<
				P extends BetterAuthPlugin
					? P["$Events"] extends infer E extends EventsMap
						? E
						: {}
					: {}
			>
		: {};
