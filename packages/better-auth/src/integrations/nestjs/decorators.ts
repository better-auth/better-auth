import { createParamDecorator, SetMetadata } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { AFTER_HOOK_KEY, BEFORE_HOOK_KEY, HOOK_KEY } from "./symbols";

/**
 * Marks a route as public, allowing unauthenticated access.
 * When applied to a controller method, the AuthGuard will skip authentication checks.
 */
export const Public = () => SetMetadata("PUBLIC", true);

/**
 * Marks a route as having optional authentication.
 * When applied to a controller method, the AuthGuard will allow the request to proceed
 * even if no session is present.
 */
export const Optional = () => SetMetadata("OPTIONAL", true);

/**
 * Parameter decorator that extracts the user session from the request.
 * Provides easy access to the authenticated user's session data in controller methods.
 */
export const Session = createParamDecorator(
	(_data: unknown, context: ExecutionContext) => {
		const request = context.switchToHttp().getRequest();
		return request.session;
	},
);

/**
 * Registers a method to be executed before a specific auth route is processed.
 * @param path - The auth route path that triggers this hook (must start with '/')
 */
export const BeforeHook = (path: `/${string}`) =>
	SetMetadata(BEFORE_HOOK_KEY, path);

/**
 * Registers a method to be executed after a specific auth route is processed.
 * @param path - The auth route path that triggers this hook (must start with '/')
 */
export const AfterHook = (path: `/${string}`) =>
	SetMetadata(AFTER_HOOK_KEY, path);

/**
 * Class decorator that marks a provider as containing hook methods.
 * Must be applied to classes that use BeforeHook or AfterHook decorators.
 */
export const Hook = () => SetMetadata(HOOK_KEY, true);
