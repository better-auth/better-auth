import { Hono } from "hono";
import { auth } from "./auth";

const app = new Hono();

app.get("/", (c) => {
	return c.text("Hello Hono!");
});

app.all("/auth/**", async(c)=>{
	return auth.handler(c.req.raw)
})

export default app;