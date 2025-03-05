import { Controller, Get, Request, UseGuards } from "@nestjs/common";
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

	@Get()
	async getHello(
		@Request() request: ExpressRequest,
		@Session() { session, user }: UserSession,
	) {
		const accounts = await this.authService.api.listUserAccounts({
			headers: fromNodeHeaders(request.headers),
		});

		return {
			session,
			user,
			accounts,
		};
	}
}
