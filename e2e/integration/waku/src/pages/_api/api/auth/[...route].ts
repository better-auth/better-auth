import { auth } from "../../../../auth";

export default function handler(request: Request): Promise<Response> {
	return auth.handler(request);
}
