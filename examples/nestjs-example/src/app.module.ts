import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { BetterAuthModule } from "better-auth/nestjs";
import { auth } from "./auth";

@Module({
	imports: [BetterAuthModule.forRoot(auth)],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {}
