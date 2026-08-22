import express from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth";

const app = express();

// Mount the Better Auth handler BEFORE express.json() — otherwise the client
// API hangs on "pending".
app.all("/api/auth/*", toNodeHandler(auth));
app.use(express.json());

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Auth server listening on ${port}`));
