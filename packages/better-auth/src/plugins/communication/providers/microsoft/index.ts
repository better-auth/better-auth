import { createFetch, createSchema } from "@better-fetch/fetch";
import { Provider, Options } from "../types";
import { DraftMessage, Message, DraftMessage } from "./types";
import { z } from "zod";

export class Microsft implements Provider {
	constructor(options: Options) {
		
	}

	fetch = createFetch({
		baseURL: "https://graph.microsoft.com/v1.0",
		retry: {
			type: "linear",
			attempts: 3,
			delay: 1000,
		},
		auth: {
			type: "Bearer",
			token: process.env.MICROSOFT_ACCESS_TOKEN,
		},
		headers: {
			"content-type": "application/json",
		},
		schema: createSchema({
			"/users/:id/sendMail": {
				input: Message,
				params: z.object({
					id: z.string(),
				}),
			},
			"/users/:id/mailFolders/:folderId/messages": {
				params: z.object({
					id: z.string(),
					folderId: z.string(),
				}),
				output: z.object({
					"@odata.context": z.string(),
					value: z.array(Message),
				}),
			},
			"/users/:id/messages": {
				params: z.object({
					id: z.string(),
				}),
				output: z.object({
					value: z.array(Message),
				}),
			},
		}),
	});

	async send(options: Options, message: typeof Message) {
		const { data, error } = await this.fetch("/users/:id/sendMail", {
			params: {
				id: options.userId,
			},
			body: message,
		});

		if (error) {
			throw error;
		}

		return true;
	}

	async getMessages(
		options: Options,
		folderId?: string
	): Promise<(typeof Message)[]> {
		if (folderId) {
			const { data, error } = await this.fetch("/users/:id/messages", {
				params: {
					id: options.userId,
				},
			});

			if (error) {
				throw error;
			}

			return data.value;
		}

		const { data, error } = await this.fetch(
			"/users/:id/mailFolders/:folderId/messages",
			{
				params: {
					id: options.userId,
					folderId,
				},
			}
		);

		if (error) {
			throw error;
		}

		return data.value;
	}

	async draft<T>(options:Options, message: T extends typeof DraftMessage) {
		const {data, error} = this.fetch<T>("/me/messages", {
			body: message,
		});

		if (error) {
			throw error;
		}

		return true;
	}
}
