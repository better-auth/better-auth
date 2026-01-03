---
title: NestJS Integration
description: Integrate Better Auth with NestJS.
---

This guide will show you how to integrate Better Auth with [NestJS](https://nestjs.com/).

Before you start, make sure you have a Better Auth instance configured. If you haven't done that yet, check out the [installation](/docs/installation).

<Callout type="info">
The NestJS integration is **community maintained**. If you encounter any issues, please open them at [nestjs-better-auth](https://github.com/ThallesP/nestjs-better-auth).
</Callout>

## Installation

Install the NestJS integration library:

```package-install
@thallesp/nestjs-better-auth
```

## Basic Setup

<Callout type="warn">
Currently the library has beta support for Fastify, if you experience any issues with it, please open an issue at [nestjs-better-auth](https://github.com/ThallesP/nestjs-better-auth).
</Callout>

### 1. Disable Body Parser

Disable NestJS's built-in body parser to allow Better Auth to handle the raw request body:

```ts title="main.ts"
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false, // Required for Better Auth
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

### 2. Import AuthModule

Import the `AuthModule` in your root module:

```ts title="app.module.ts"
import { Module } from '@nestjs/common';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { auth } from "./auth"; // Your Better Auth instance

@Module({
  imports: [
    AuthModule.forRoot({ auth }),
  ],
})
export class AppModule {}
```

### 3. Route Protection

**Global by default**: An `AuthGuard` is registered globally by this module. All routes are protected unless you explicitly allow access.

Use the `Session` decorator to access the user session:

```ts title="user.controller.ts"
import { Controller, Get } from '@nestjs/common';
import { Session, UserSession, AllowAnonymous, OptionalAuth } from '@thallesp/nestjs-better-auth';

@Controller('users')
export class UserController {
  @Get('me')
  async getProfile(@Session() session: UserSession) {
    return { user: session.user };
  }

  @Get('public')
  @AllowAnonymous() // Allow anonymous access
  async getPublic() {
    return { message: 'Public route' };
  }

  @Get('optional')
  @OptionalAuth() // Authentication is optional
  async getOptional(@Session() session: UserSession) {
    return { authenticated: !!session };
  }
}
```

## Full Documentation

For comprehensive documentation including decorators, hooks, global guards, and advanced configuration, visit the [NestJS Better Auth repository](https://github.com/thallesp/nestjs-better-auth).
