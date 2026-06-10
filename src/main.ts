import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import 'dotenv/config'

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // drop unnecessary attribute/params from frontend/client
  app
    .use(cookieParser())
    .useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true
      }),
    )
    .enableCors({
      // for react/next frotnend support for future
      // origin: 'http://localhost:3000',
      origin: true,
      credentials: true
    });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
