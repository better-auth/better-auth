import { Inject, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Auth } from "../../auth";
import { fromNodeHeaders } from "../node";
import type { getSession } from "../../api";

export type UserSession = Exclude<
	Awaited<ReturnType<ReturnType<typeof getSession>>>,
	null | undefined
>;

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
		request.user = session?.user ?? null; // useful for observability tools like Sentry

		const isPublic = this.reflector.get("PUBLIC", context.getHandler());

		if (isPublic) return true;

		const isOptional = this.reflector.get("OPTIONAL", context.getHandler());

		if (isOptional && !session) return true;

		if (!session) throw new UnauthorizedException();

		return true;
	}
}
