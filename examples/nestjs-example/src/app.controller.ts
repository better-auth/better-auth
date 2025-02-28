import { Controller, Get, Request, UseGuards } from "@nestjs/common";
import { AuthGuard, AuthService } from "better-auth/nestjs";
import { fromNodeHeaders } from "better-auth/node";

@Controller()
@UseGuards(AuthGuard)
export class AppController {
	constructor(private auth: AuthService) {}

	@Get()
	async getHello(@Request() request: Request) {
		return await this.auth.api.listUserAccounts({
			headers: fromNodeHeaders(request.headers),
		});
	}
}
