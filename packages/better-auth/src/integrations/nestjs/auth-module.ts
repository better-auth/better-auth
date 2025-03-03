import { Inject, Module, RequestMethod } from "@nestjs/common";
import type {
	DynamicModule,
	Provider,
	MiddlewareConsumer,
	NestModule,
	Type,
} from "@nestjs/common";
import {
	DiscoveryModule,
	DiscoveryService,
	MetadataScanner,
} from "@nestjs/core";
import type { Auth } from "../../auth";
import { createAuthMiddleware } from "../../plugins";
import { toNodeHandler } from "../node";
import { AuthService } from "./auth-service";
import { BEFORE_HOOK_KEY, AFTER_HOOK_KEY, HOOK_KEY } from "./metadata-symbols";

export interface AuthModuleOptions {
	auth: Auth;
}

export interface AuthModuleAsyncOptions {
	imports?: any[];
	useFactory: (
		...args: any[]
	) => Promise<AuthModuleOptions> | AuthModuleOptions;
	inject?: any[];
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

	static forRootAsync(options: AuthModuleAsyncOptions): DynamicModule {
		return {
			module: AuthModule,
			imports: options.imports || [],
			providers: [...this.createAsyncProviders(options), AuthService],
			exports: [
				{
					provide: "AUTH_OPTIONS",
					useFactory: (options: AuthModuleOptions) => options.auth,
					inject: ["AUTH_MODULE_OPTIONS"],
				},
				AuthService,
			],
		};
	}

	private static createAsyncProviders(
		options: AuthModuleAsyncOptions,
	): Provider[] {
		const providers: Provider[] = [
			{
				provide: "AUTH_MODULE_OPTIONS",
				useFactory: options.useFactory,
				inject: options.inject || [],
			},
			{
				provide: "AUTH_OPTIONS",
				useFactory: (options: AuthModuleOptions) => {
					const auth = options.auth;
					// Create auth with passthrough hooks that can be overridden in configure
					auth.options.hooks = {
						...auth.options.hooks,
					};
					return auth;
				},
				inject: ["AUTH_MODULE_OPTIONS"],
			},
		];

		return providers;
	}
}
