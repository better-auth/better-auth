import { toNodeHandler as toNode } from "better-call";
import type { Auth } from "../auth";

export const toNodeHandler = (auth: Auth | Auth["handler"]) => {
	return "handler" in auth ? toNode(auth.handler) : toNode(auth);
};
