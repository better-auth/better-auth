import {
	Inject,
	Logger,
	Module,
	RequestMethod,
	type MiddlewareConsumer,
	type NestModule,
} from "@nestjs/common";
import type { Auth } from "../auth";
import { toNodeHandler } from "./node";

@Module({})
export class BetterAuthModule implements NestModule {
	private logger = new Logger(BetterAuthModule.name);

	constructor(@Inject("BETTER_AUTH_OPTIONS") private readonly auth: Auth) {}

	configure(consumer: MiddlewareConsumer) {
		consumer.apply(toNodeHandler(this.auth)).forRoutes({
			path: "api/auth/*path",
			method: RequestMethod.ALL,
		});
		this.logger.log("BetterAuthModule initialized");
	}

	static forRoot(auth: Auth) {
		return {
			module: BetterAuthModule,
			providers: [
				{
					provide: "BETTER_AUTH_OPTIONS",
					useValue: auth,
				},
			],
			exports: [],
		};
	}
}
