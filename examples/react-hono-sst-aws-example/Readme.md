# Full Stack SST Demo

A full-stack application demonstrating the integration of SST (AWS), React, Hono, Better-Auth, and MongoDB.

## Tech Stack

- **Frontend**: React + Vite + TypeScript
- **Backend**: Hono + TypeScript
- **Infrastructure**: SST (AWS)
- **Authentication**: Better-Auth
- **Database**: MongoDB
- **Styling**: Tailwind CSS + shadcn/ui
- **Package Manager**: pnpm

## Prerequisites

- Node.js 18+ and pnpm (`npm install -g pnpm`)
- AWS CLI configured with appropriate credentials ([SST AWS Setup Guide](https://sst.dev/docs/aws-accounts#_top))
- MongoDB Atlas account (for database)
- Google Cloud Console project (for OAuth)

## Project Structure

```
├── packages/
│   ├── client/          # React frontend
│   └── server/          # Hono backend
├── infra/               # SST infrastructure code
├── sst.config.ts        # SST configuration
└── package.json
```

## Setup Instructions

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd <project-directory>
   ```

2. **Install dependencies**
   ```bash
   # Install all dependencies (root, client, and server)
   pnpm run install:all

   # Or install separately:
   pnpm install                         # Root dependencies
   pnpm run install:client              # Client dependencies
   pnpm run install:server              # Server dependencies
   ```

3. **Environment Setup**

   a. Create MongoDB Atlas cluster and get connection string

   b. Setup Google OAuth credentials:
   - Go to Google Cloud Console
   - Create a new project
   - Enable OAuth 2.0
   - Create credentials (OAuth client ID)
   - Add authorized redirect URIs:
     - `http://localhost:5173` (development)
     - Your CloudFront URL (production)

   c. Set SST secrets:
   ```bash
   npx sst secrets set MONGODB_URI "your-mongodb-connection-string"
   npx sst secrets set GOOGLE_CLIENT_ID "your-google-client-id"
   npx sst secrets set GOOGLE_CLIENT_SECRET "your-google-client-secret"
   ```

4. **Update Configuration Files**

   a. Update trusted origins in `packages/server/lib/auth.ts`:
   ```typescript
   trustedOrigins: [
     "http://localhost:5173",
     "your-cloudfront-url"
   ]
   ```

   b. Update CORS settings in `infra/hono.ts`:
   ```typescript
   allowOrigins: [
     "http://localhost:5173",
     "your-cloudfront-url"
   ]
   ```

   c. Update auth client baseURL in `packages/client/src/lib/auth-client.ts`:
   ```typescript
   baseURL: "your-lambda-url"
   ```

## Development

1. **Start the development server**
   ```bash
   # Start both frontend and backend (with concurrent output)
   pnpm run dev

   # Or run individually:
   pnpm run dev:client    # Frontend only
   pnpm run dev:server    # Backend only
   ```

2. **Access the application**
   - Frontend: http://localhost:5173
   - Backend: Check console for Lambda URL

## Deployment

1. **Deploy to AWS**
   ```bash
   # Build frontend and deploy to AWS
   pnpm run deploy
   ```
   > Alternatively you can run `npx sst deploy` at the root directory, after `pn run build` in `packages/client` directory

2. **Update URLs**
   After deployment, SST will output:
   - CloudFront URL for frontend
   - Lambda URL for backend

   Update these URLs in:
   - `packages/server/lib/auth.ts`
   - `infra/hono.ts`
   - `packages/client/src/lib/auth-client.ts`

## URL Configuration After Deployment

After deploying with `pnpm run deploy`, SST will output two important URLs:
1. CloudFront URL (for frontend) - Example: `https://{distribution-id}.cloudfront.net`
2. Lambda URL (for backend API) - Example: `https://{lambda-id}.lambda-url.{region}.on.aws`

You need to update these URLs in three files:

1. **Frontend Auth Client** (`packages/client/src/lib/auth-client.ts`):
   ```typescript
   baseURL: "https://{your-lambda-url}.lambda-url.{region}.on.aws" // Replace with your Lambda URL
   ```

2. **Backend Auth Config** (`packages/server/lib/auth.ts`):
   ```typescript
   trustedOrigins: [
     "http://localhost:5173",
     "https://{your-distribution-id}.cloudfront.net",  // AWS deployed Cloudfront URL
     "https://{your-custom-domain}"                    // AWS deployed domain URL (if using custom domain)
   ]
   ```

3. **Backend CORS Settings** (`infra/hono.ts`):
   ```typescript
   allowOrigins: [
     "http://localhost:5173",
     "https://{your-distribution-id}.cloudfront.net",  // AWS deployed Cloudfront URL
     "https://{your-custom-domain}"                    // AWS deployed domain URL (if using custom domain)
   ],
   allowMethods: ["GET", "POST", "PUT", "DELETE"],
   allowHeaders: ["Content-Type", "Authorization"],
   allowCredentials: true,
   maxAge: "600 seconds",
   exposeHeaders: ["Content-Length"]
   ```

### Custom Domain Configuration

If you want to use a custom domain, update the StaticSite configuration in `infra/web.ts`:

```typescript
const web = new sst.aws.StaticSite("Web", {
    path: "packages/client/dist",
    domain: {
        name: "{your-domain}",  // e.g., "example.com"
        dns: false,             // Set to true if you want SST to manage DNS
        cert: "{your-acm-cert}" // Your ACM certificate ARN
    }
});
```

Note: 
- Ensure your ACM certificate is in the `us-east-1` region for CloudFront distribution
- If `dns: false`, you'll need to manually configure your DNS settings
- The certificate ARN format: `arn:aws:acm:{region}:{account-id}:certificate/{certificate-id}`

After configuring custom domain, update the URLs in:
1. `packages/server/lib/auth.ts` (add domain to trustedOrigins)
2. `infra/hono.ts` (add domain to CORS allowOrigins)

After updating these URLs, redeploy the application:
```bash
pnpm run deploy
```
This makes it clearer where developers need to update URLs after deployment. The development URLs (`http://localhost:5173`) should remain unchanged as they're used for local development.

## Available Scripts

- `pnpm run install:all` - Install all dependencies
- `pnpm run dev` - Start development servers (frontend + backend)
- `pnpm run deploy` - Build and deploy to AWS
- `pnpm run clean` - Remove all node_modules and build directories
- `pnpm run clean:install` - Clean and reinstall all dependencies
 
## Troubleshooting

1. **CORS Issues**
   - Ensure all origins are properly configured in both `auth.ts` and `hono.ts`
   - Check that `allowCredentials` is set to `true` for cookie handling

2. **Authentication Problems**
   - Verify Google OAuth credentials and redirect URIs
   - Ensure cookies are being properly set (check browser dev tools)

3. **Deployment Issues**
   - Check AWS CloudWatch logs
   - Verify SST secrets are properly set
   - Ensure MongoDB IP whitelist includes AWS Lambda IPs

4. **Package Manager Issues**
   - If you encounter any issues with pnpm, try running `pnpm run clean:install`
   - Make sure you're using pnpm version 8 or higher
   - If modules are missing, run `pnpm install` in the specific package directory

