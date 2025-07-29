import { createFetch } from "@better-fetch/fetch";

export type Provider = {
	fetch: ReturnType<typeof createFetch>

	send: () => Promise<boolean>
	getMessages: () => Promise<any>

};

export type Options = {
	userId: string
}