import { Hono } from 'hono'
import { handle } from 'hono/aws-lambda'
import { auth } from './lib/auth';

const app = new Hono<{
    Variables: {
        user: auth.$Infer.Session.user | null;
        session: auth.$Infer.Session.session | null
    }
}>();

app.use("*", async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });

    if (!session) {
        c.set("user", null);
        c.set("session", null);
        return next();
    }

    c.set("user", session.user);
    c.set("session", session.session);
    return next();
});

app.get('/api/auth/*', (c) => auth.handler(c.req.raw));
app.post('/api/auth/*', (c) => auth.handler(c.req.raw));


export const handler = handle(app)