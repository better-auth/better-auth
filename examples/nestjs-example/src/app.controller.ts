import { Body, Controller, Post, Request, UseGuards } from "@nestjs/common";
import {
	AuthGuard,
	AuthService,
	Session,
	UserSession,
} from "better-auth/nestjs";
import { fromNodeHeaders } from "better-auth/node";
import type { Request as ExpressRequest } from "express";
import { auth } from "./auth";

@Controller()
@UseGuards(AuthGuard)
export class AppController {
	constructor(private authService: AuthService<typeof auth>) {}

	@Post()
	async echo(
		@Request() request: ExpressRequest,
		@Session() { session, user }: UserSession,
		@Body() body: unknown,
	) {
		const accounts = await this.authService.api.listUserAccounts({
			headers: fromNodeHeaders(request.headers),
		});

		return {
			session,
			user,
			accounts,
			echo: body,
		};
	}
}
