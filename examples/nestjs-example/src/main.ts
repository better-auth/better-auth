import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { NestFastifyApplication } from "@nestjs/platform-fastify";

async function bootstrap() {
	const app = await NestFactory.create<NestFastifyApplication>(AppModule, {
		bodyParser: false,
	});
	await app.listen(process.env.PORT ?? 3333);
}
bootstrap();
