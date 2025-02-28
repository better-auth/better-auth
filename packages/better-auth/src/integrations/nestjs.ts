import {
	createParamDecorator,
	Inject,
	Injectable,
	Logger,
	Module,
	RequestMethod,
	SetMetadata,
	UnauthorizedException,
	type CanActivate,
	type ExecutionContext,
	type MiddlewareConsumer,
	type NestModule,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Auth } from "../auth";
import { fromNodeHeaders, toNodeHandler } from "./node";

export const Public = () => SetMetadata("PUBLIC", true);
export const Optional = () => SetMetadata("OPTIONAL", true);

export const Session = createParamDecorator(
	(_data: unknown, context: ExecutionContext) => {
		const request = context.switchToHttp().getRequest();
		return request.session;
	},
);

@Injectable()
export class AuthService {
	constructor(
		@Inject("AUTH_OPTIONS")
		private readonly auth: Auth,
	) {}

	get api() {
		return this.auth.api;
	}
}

export class AuthGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		@Inject("AUTH_OPTIONS")
		private readonly auth: Auth,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest();
		const session = await this.auth.api.getSession({
			headers: fromNodeHeaders(request.headers),
		});

		request.session = session;

		const isPublic = this.reflector.get("PUBLIC", context.getHandler());

		if (isPublic) return true;

		const isOptional = this.reflector.get("OPTIONAL", context.getHandler());

		if (isOptional && !session) return true;

		if (!session) throw new UnauthorizedException();

		return true;
	}
}

@Module({})
export class AuthModule implements NestModule {
	private logger = new Logger(AuthModule.name);

	constructor(@Inject("AUTH_OPTIONS") private readonly auth: Auth) {}

	configure(consumer: MiddlewareConsumer) {
		const handler = toNodeHandler(this.auth);
		consumer.apply(handler).forRoutes({
			path: "/api/auth/*path",
			method: RequestMethod.ALL,
		});
		this.logger.log("AuthModule initialized");
	}

	static forRoot(auth: Auth) {
		return {
			module: AuthModule,
			providers: [
				{
					provide: "AUTH_OPTIONS",
					useValue: auth,
				},
				AuthService,
			],
			exports: [
				{
					provide: "AUTH_OPTIONS",
					useValue: auth,
				},
				AuthService,
			],
		};
	}
}
