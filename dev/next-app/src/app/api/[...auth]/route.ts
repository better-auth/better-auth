import { auth } from "@/lib/auth";

const handler = auth.handler;

export { handler as GET, handler as POST };
