import { auth } from "~/utils/auth.config";

export default defineEventHandler((event) => {
	return auth.handler(toWebRequest(event));
});
