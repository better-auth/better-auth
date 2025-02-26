import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard, Session, AuthService, Optional } from "better-auth/nestjs";

@Controller()
@UseGuards(AuthGuard)
export class AppController {
	constructor(private auth: AuthService) {}

	@Get()
	@Optional()
	async getHello(@Session() session?: Session) {
		console.log(await this.auth.api.listAccounts());
		return `Hello ${session?.user.name}!`;
	}
}
