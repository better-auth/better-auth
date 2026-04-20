# Better Auth Redis Adapter

Redis adapter for [Better Auth](https://www.better-auth.com) — provides a lightweight key-value based database adapter for authentication use cases.

## Installation

```bash
npm install @better-auth/redis-adapter
```
## Usage

import { betterAuth } from "better-auth";
import { redisAdapter } from "@better-auth/redis-adapter";

const auth = betterAuth({
  database: redisAdapter(),
});

## Features

- Basic CRUD support (create, findOne, findMany, delete)
- Uses Redis key-value storage
- SCAN-based key retrieval (safe for production)
- Lightweight and fast

## Use Cases

- Session storage
- Token storage
- Lightweight database replacement using Redis

## Limitations

- Only supports basic equality filtering
- No join support
- Not intended for complex relational queries

## Difference from @better-auth/redis-storage

The redis-storage package provides low-level key-value operations.

This adapter builds on top of Redis to provide a higher-level database interface compatible with Better Auth’s adapter system.

## Documentation

For full documentation, visit [better-auth.com](https://www.better-auth.com).

## License

MIT