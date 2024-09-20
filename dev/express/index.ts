import express from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth";

const app = express();
const port = 3005;

app.get("/api/auth/*", toNodeHandler(auth));

app.listen(port, () => {
	console.log(`Example app listening on port ${port}`);
});
