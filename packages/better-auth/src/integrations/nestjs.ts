import {
	createParamDecorator,
	Inject,
	Module,
	RequestMethod,
	SetMetadata,
	UnauthorizedException,
	type CanActivate,
	type ExecutionContext,
	type MiddlewareConsumer,
	type NestModule,
} from "@nestjs/common";
import {
	Reflector,
	DiscoveryService,
	DiscoveryModule,
	MetadataScanner,
} from "@nestjs/core";
import type { Auth } from "../auth";
import { fromNodeHeaders, toNodeHandler } from "./node";
import { createAuthMiddleware } from "../plugins";

export const Public = () => SetMetadata("PUBLIC", true);
export const Optional = () => SetMetadata("OPTIONAL", true);

export const Session = createParamDecorator(
	(_data: unknown, context: ExecutionContext) => {
		const request = context.switchToHttp().getRequest();
		return request.session;
	},
);

const BEFORE_HOOK_KEY = Symbol("BEFORE_HOOK");
const HOOK_KEY = Symbol("HOOK");

export const BeforeHook = (path: `/${string}`) =>
	SetMetadata(BEFORE_HOOK_KEY, path);

export const Hook = () => SetMetadata(HOOK_KEY, true);

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

@Module({
	imports: [DiscoveryModule],
})
export class AuthModule implements NestModule {
	constructor(
		@Inject("AUTH_OPTIONS") private readonly auth: Auth,
		@Inject(DiscoveryService)
		private discoveryService: DiscoveryService,
		@Inject(MetadataScanner)
		private metadataScanner: MetadataScanner,
	) {}

	configure(consumer: MiddlewareConsumer) {
		const providers = this.discoveryService
			.getProviders()
			.filter(
				({ metatype }) => metatype && Reflect.getMetadata(HOOK_KEY, metatype),
			);

		for (const provider of providers) {
			const providerPrototype = Object.getPrototypeOf(provider.instance);
			const methods = this.metadataScanner.getAllMethodNames(providerPrototype);

			for (const method of methods) {
				const providerMethod = providerPrototype[method];
				const beforeHookPath = Reflect.getMetadata(
					BEFORE_HOOK_KEY,
					providerMethod,
				);

				if (!this.auth.options.hooks) return;

				const originalBeforeHook = this.auth.options.hooks.before;

				this.auth.options.hooks.before = createAuthMiddleware(async (ctx) => {
					if (originalBeforeHook) {
						await originalBeforeHook(ctx);
					}

					if (beforeHookPath === ctx.path) {
						await providerMethod(ctx);
					}
				});
			}
		}

		const handler = toNodeHandler(this.auth);
		consumer.apply(handler).forRoutes({
			path: "/api/auth/*path",
			method: RequestMethod.ALL,
		});
	}

	static forRoot(auth: any) {
		// Create auth with passthrough hooks that can be overridden in configure
		auth.options.hooks = {
			...auth.options.hooks,
		};

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
