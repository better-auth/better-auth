import { Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Auth } from "../../auth";
import { fromNodeHeaders } from "../node";
import { APIError, type getSession } from "../../api";
import { AUTH_INSTANCE_KEY } from "./symbols";

/**
 * Type representing a valid user session after authentication
 * Excludes null and undefined values from the session return type
 */
export type UserSession = NonNullable<
	Awaited<ReturnType<ReturnType<typeof getSession>>>
>;

/**
 * NestJS guard that handles authentication for protected routes
 * Can be configured with @Public() or @Optional() decorators to modify authentication behavior
 */
@Injectable()
export class AuthGuard implements CanActivate {
	constructor(
		@Inject(Reflector)
		private readonly reflector: Reflector,
		@Inject(AUTH_INSTANCE_KEY)
		private readonly auth: Auth,
	) {}

	/**
	 * Validates if the current request is authenticated
	 * Attaches session and user information to the request object
	 * @param context - The execution context of the current request
	 * @returns True if the request is authorized to proceed, throws an error otherwise
	 */
	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest();
		const session = await this.auth.api.getSession({
			headers: fromNodeHeaders(request.headers),
		});

		request.session = session;
		request.user = session?.user ?? null; // useful for observability tools like Sentry

		const isPublic = this.reflector.get("PUBLIC", context.getHandler());

		if (isPublic) return true;

		const isOptional = this.reflector.get("OPTIONAL", context.getHandler());

		if (isOptional && !session) return true;

		if (!session)
			throw new APIError(401, {
				code: "UNAUTHORIZED",
				message: "Unauthorized",
			});

		return true;
	}
}
