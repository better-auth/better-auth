import type { RedisClientType } from "redis";
import { generateRandomString } from "../crypto/random";
import type { SessionAdapter } from "./types";

export const redisSessionAdapter = (
	client: RedisClientType,
): SessionAdapter => {
	return {
		async create({ userId, expiresAt }) {
			const sessionId = generateRandomString(21);
			client.set(
				sessionId,
				JSON.stringify({
					sessionId,
					userId,
					expiresAt,
				}),
				{
					EX: expiresAt.getTime(),
				},
			);
			return {
				id: sessionId,
				userId,
				expiresAt,
			};
		},
		async update(data) {
			await client.set(
				data.id,
				JSON.stringify({
					sessionId: data.id,
					userId: data.userId,
					expiresAt: data.expiresAt,
				}),
				{
					EX: data.expiresAt.getTime(),
				},
			);
			return data;
		},
		async findOne(data) {
			const session = await client.get(data.userId);
			if (!session) {
				return null;
			}
			const sessionData = JSON.parse(session);
			return {
				id: sessionData.sessionId,
				userId: data.userId,
				expiresAt: sessionData.expiresAt,
			};
		},
		async delete(data) {
			await client.del(data.sessionId);
		},
	};
};
