import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AuthModule } from "better-auth/nestjs";
import { auth } from "./auth";
import { HooksModule } from "./hooks/hooks.module";

@Module({
	imports: [AuthModule.forRoot(auth), HooksModule],
	controllers: [AppController],
})
export class AppModule {}
