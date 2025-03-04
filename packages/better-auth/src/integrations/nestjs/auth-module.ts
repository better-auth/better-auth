import { Inject, Module, RequestMethod } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule, Provider } from "@nestjs/common";
import {
	APP_FILTER,
	DiscoveryModule,
	DiscoveryService,
	MetadataScanner,
} from "@nestjs/core";
import type { Auth } from "../../auth";
import { createAuthMiddleware } from "../../plugins";
import { toNodeHandler } from "../node";
import { AuthService } from "./auth-service";
import { BEFORE_HOOK_KEY, AFTER_HOOK_KEY, HOOK_KEY } from "./metadata-symbols";
import { APIErrorExceptionFilter } from "./api-error-exception-filter";

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

				this.setupHook(BEFORE_HOOK_KEY, "before", providerMethod);
				this.setupHook(AFTER_HOOK_KEY, "after", providerMethod);
			}
		}

		const handler = toNodeHandler(this.auth);
		consumer.apply(handler).forRoutes({
			path: "/api/auth/*path",
			method: RequestMethod.ALL,
		});
	}

	private setupHook(
		metadataKey: symbol,
		hookType: "before" | "after",
		providerMethod: Function,
	) {
		const hookPath = Reflect.getMetadata(metadataKey, providerMethod);
		if (!hookPath || !this.auth.options.hooks) return;

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

	static forRoot(
		auth: any,
		{ disableExceptionFilter }: { disableExceptionFilter?: boolean } = {},
	) {
		// Initialize hooks with an empty object if undefined
		// Without this initialization, the setupHook method won't be able to properly override hooks
		// It won't throw an error, but any hook functions we try to add won't be called
		auth.options.hooks = {
			...auth.options.hooks,
		};

		const providers: Provider[] = [
			{
				provide: "AUTH_OPTIONS",
				useValue: auth,
			},
			AuthService,
		];

		if (!disableExceptionFilter) {
			providers.push({
				provide: APP_FILTER,
				useClass: APIErrorExceptionFilter,
			});
		}

		return {
			module: AuthModule,
			providers,
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
