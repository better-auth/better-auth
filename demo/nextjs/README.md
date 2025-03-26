# Better Auth Demo App

Welcome to the Better Auth demo app! This project is built with [Next.js](https://nextjs.org) using [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Here’s how you can get the app running locally:

### Prerequisites

1. **Clone the repo**:

   ```bash
   git clone https://github.com/better-auth/better-auth
   cd better-auth/demo/nextjs
   ```

2. **Install the dependencies**:

   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

3. **Set up your environment variables**:

   - Rename the `.env.example` file to `.env.local`:

     ```bash
     mv .env.example .env.local
     ```

   - Open `.env.local` and fill in the required details. These will include things like API URLs, client IDs, and secrets needed to connect to the Better Auth service.

### Start the Development Server

Once everything is set up, start the development server with:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

The app will be live at [http://localhost:3000](http://localhost:3000). Open it in your browser, and you’re good to go!

Feel free to jump in and edit the app by modifying `app/page.tsx`. Any changes you make will update automatically in the browser.

## Features

Here’s what this app supports out of the box:

- **Email & Password**: Simple and secure authentication.
- **Organization / Teams**: Manage users within organizations or teams.
- **Passkeys**: Passwordless login using modern authentication standards.
- **Multi-Factor Authentication (MFA)**: Add an extra layer of security.
- **Password Reset**: Let users reset their passwords if they forget them.
- **Email Verification**: Make sure users verify their email addresses.
- **Roles & Permissions**: Define and manage who can do what.
- **Rate Limiting**: Protect your app from abuse with smart limits.
- **Session Management**: Handle user sessions seamlessly.
- **Stripe Plugin**: Integrate Stripe for customer management, subscriptions, and webhooks.

## Learn More

Here are some helpful links if you want to dive deeper:

- [Better Auth Documentation](https://better-auth.com/docs) - Everything you need to know to integrate Better Auth.
- [Next.js Documentation](https://nextjs.org/docs) - Learn about the framework we used to build this app.
- [Learn Next.js](https://nextjs.org/learn) - A hands-on tutorial for Next.js.

---

If you run into issues or have suggestions, feel free to open an issue or submit a pull request on the [GitHub repo](https://github.com/better-auth/better-auth).

Happy coding!
