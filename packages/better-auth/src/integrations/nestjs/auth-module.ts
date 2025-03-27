import { Inject, Logger, Module } from "@nestjs/common";
import type {
	MiddlewareConsumer,
	NestModule,
	OnModuleInit,
	Provider,
} from "@nestjs/common";
import {
	APP_FILTER,
	DiscoveryModule,
	DiscoveryService,
	HttpAdapterHost,
	MetadataScanner,
} from "@nestjs/core";
import type { Auth } from "../../auth";
import { createAuthMiddleware } from "../../plugins";
import { toNodeHandler } from "../node";
import { AuthService } from "./auth-service";
import {
	BEFORE_HOOK_KEY,
	AFTER_HOOK_KEY,
	HOOK_KEY,
	AUTH_INSTANCE_KEY,
	AUTH_MODULE_OPTIONS_KEY,
} from "./symbols";
import { APIErrorExceptionFilter } from "./api-error-exception-filter";
import { SkipBodyParsingMiddleware } from "./middlewares";
import type { Request, Response } from "express";

/**
 * Configuration options for the AuthModule
 */
type AuthModuleOptions = {
	disableExceptionFilter?: boolean;
	disableTrustedOriginsCors?: boolean;
	disableBodyParser?: boolean;
};

const HOOKS = [
	{ metadataKey: BEFORE_HOOK_KEY, hookType: "before" as const },
	{ metadataKey: AFTER_HOOK_KEY, hookType: "after" as const },
];

/**
 * NestJS module that integrates the Auth library with NestJS applications.
 * Provides authentication middleware, hooks, and exception handling.
 */
@Module({
	imports: [DiscoveryModule],
})
export class AuthModule implements NestModule, OnModuleInit {
	private logger = new Logger(AuthModule.name);
	constructor(
		@Inject(AUTH_INSTANCE_KEY) private readonly auth: Auth,
		@Inject(DiscoveryService)
		private discoveryService: DiscoveryService,
		@Inject(MetadataScanner)
		private metadataScanner: MetadataScanner,
		@Inject(HttpAdapterHost)
		private readonly adapter: HttpAdapterHost,
		@Inject(AUTH_MODULE_OPTIONS_KEY)
		private readonly options: AuthModuleOptions,
	) {}

	onModuleInit() {
		// Setup hooks
		if (!this.auth.options.hooks) return;

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
				this.setupHooks(providerMethod);
			}
		}
	}

	configure(consumer: MiddlewareConsumer) {
		const trustedOrigins = this.auth.options.trustedOrigins;
		// function-based trustedOrigins requires a Request (from web-apis) object to evaluate, which is not available in NestJS (we only have a express Request object)
		// if we ever need this, take a look at better-call which show an implementation for this
		const isNotFunctionBased = trustedOrigins && Array.isArray(trustedOrigins);

		if (!this.options.disableTrustedOriginsCors && isNotFunctionBased) {
			for (const origin of trustedOrigins) {
				this.adapter.httpAdapter.enableCors({
					origin,
					methods: ["GET", "POST", "PUT", "DELETE"],
					credentials: true,
				});
			}
		} else if (trustedOrigins)
			throw new Error(
				"Function-based trustedOrigins not supported in NestJS. Use string array or disable CORS with disableTrustedOriginsCors: true.",
			);

		if (!this.options.disableBodyParser)
			consumer.apply(SkipBodyParsingMiddleware).forRoutes("*");

		// Get basePath from options or use default
		let basePath = this.auth.options.basePath ?? "/api/auth";

		// Ensure basePath starts with /
		if (!basePath.startsWith("/")) {
			basePath = "/" + basePath;
		}

		// Ensure basePath doesn't end with /
		if (basePath.endsWith("/")) {
			basePath = basePath.slice(0, -1);
		}

		const handler = toNodeHandler(this.auth);
		this.adapter.httpAdapter
			.getInstance()
			// little hack to ignore any global prefix
			// for now i'll just not support a global prefix
			.use(`${basePath}/*path`, (req: Request, res: Response) => {
				req.url = req.baseUrl;

				return handler(req, res);
			});
		this.logger.log(`AuthModule initialized BetterAuth on '${basePath}/*'`);
	}

	private setupHooks(providerMethod: Function) {
		if (!this.auth.options.hooks) return;

		for (const { metadataKey, hookType } of HOOKS) {
			const hookPath = Reflect.getMetadata(metadataKey, providerMethod);
			if (!hookPath) continue;

			const originalHook = this.auth.options.hooks[hookType];
			this.auth.options.hooks[hookType] = createAuthMiddleware(async (ctx) => {
				if (originalHook) {
					await originalHook(ctx);
				}

				if (hookPath === ctx.path) {
					await providerMethod(ctx);
				}
			});
		}
	}

	/**
	 * Static factory method to create and configure the AuthModule.
	 * @param auth - The Auth instance to use
	 * @param options - Configuration options for the module
	 */
	static forRoot(auth: any, options: AuthModuleOptions = {}) {
		// Initialize hooks with an empty object if undefined
		// Without this initialization, the setupHook method won't be able to properly override hooks
		// It won't throw an error, but any hook functions we try to add won't be called
		auth.options.hooks = {
			...auth.options.hooks,
		};

		const providers: Provider[] = [
			{
				provide: AUTH_INSTANCE_KEY,
				useValue: auth,
			},
			{
				provide: AUTH_MODULE_OPTIONS_KEY,
				useValue: options,
			},
			AuthService,
		];

		if (!options.disableExceptionFilter) {
			providers.push({
				provide: APP_FILTER,
				useClass: APIErrorExceptionFilter,
			});
		}

		return {
			global: true,
			module: AuthModule,
			providers,
			exports: [
				{
					provide: AUTH_INSTANCE_KEY,
					useValue: auth,
				},
				{
					provide: AUTH_MODULE_OPTIONS_KEY,
					useValue: options,
				},
				AuthService,
			],
		};
	}
}
