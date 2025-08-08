# Base Plugin for Better Auth

Complete "Sign in with Base" integration for better-auth, following the official [Base Account authentication guidelines](https://docs.base.org/base-account/guides/authenticate-users).

## Features

✅ **Full SIWE Compliance** - Uses Sign-in with Ethereum (EIP-4361) standard  
✅ **Base Mainnet Support** - Optimized for Base chain (chainId: 8453)  
✅ **Base Account SDK Integration** - Compatible with `@base-org/account`  
✅ **Wallet Connect Support** - Uses `wallet_connect` method with fallback  
✅ **ERC-6492 Compatible** - Works with undeployed smart wallets  
✅ **Better Auth Integration** - Leverages existing SIWE infrastructure  

## Installation

```bash
npm install better-auth @base-org/account viem
```

## Basic Setup

### Server Configuration

```typescript
import { betterAuth } from "better-auth";
import { base } from "better-auth/plugins/base";

export const auth = betterAuth({
  database: {
    // your database config
  },
  plugins: [
    base({
      domain: "myapp.com", // your app domain
      anonymous: true, // allow sign-in without email
    })
  ]
});
```

### Client Configuration

```typescript
import { createAuthClient } from "better-auth/client";
import { baseClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: "http://localhost:3000",
  plugins: [baseClient()]
});
```

## Usage Examples

### Simple Sign In

```typescript
import { authClient } from "./auth-client";

async function signInWithBase() {
  try {
    const result = await authClient.base.signInWithBase();
    console.log("Signed in:", result);
  } catch (error) {
    console.error("Sign in failed:", error);
  }
}
```

### React Component

```tsx
import { useState } from "react";
import { authClient } from "./auth-client";

export function BaseSignInButton() {
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    setLoading(true);
    try {
      await authClient.base.signInWithBase();
      // Redirect or update UI
    } catch (error) {
      console.error("Authentication failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button 
      onClick={handleSignIn} 
      disabled={loading}
      className="base-sign-in-button"
    >
      {loading ? "Connecting..." : "Sign in with Base"}
    </button>
  );
}
```

### With Official Base UI Component

```tsx
import { SignInWithBaseButton } from "@base-org/account-ui/react";
import { authClient } from "./auth-client";

export function BaseSignIn() {
  return (
    <SignInWithBaseButton
      colorScheme="light"
      onClick={() => authClient.base.signInWithBase()}
    />
  );
}
```

## Configuration Options

```typescript
interface BasePluginOptions {
  /**
   * Domain for SIWE message generation
   * @default current domain
   */
  domain?: string;
  
  /**
   * Email domain for user creation (when anonymous is false)
   * @default current domain  
   */
  emailDomainName?: string;
  
  /**
   * Allow anonymous sign-in without email
   * @default true
   */
  anonymous?: boolean;
  
  /**
   * Custom nonce generator
   * @default crypto.randomUUID
   */
  getNonce?: () => Promise<string>;
  
  /**
   * ENS/Basename lookup for user profile
   */
  ensLookup?: (args: { walletAddress: string }) => Promise<{
    name?: string;
    avatar?: string;
  }>;
}
```

## Advanced Usage

### Custom Chain Support

```typescript
// Support Base testnet or other chains
const result = await authClient.base.signInWithBase({
  chainId: 84532, // Base Sepolia testnet
});
```

### Fallback for Unsupported Wallets

```typescript
import { signInWithBaseFallback } from "better-auth/client/plugins";

// Automatic fallback if wallet_connect is not supported
try {
  await authClient.base.signInWithBase();
} catch (error) {
  if (error.message.includes("method_not_supported")) {
    await signInWithBaseFallback();
  }
}
```

### ENS/Basename Integration

```typescript
base({
  ensLookup: async ({ walletAddress }) => {
    // Custom ENS/Basename resolution
    const name = await resolveBasename(walletAddress);
    const avatar = await getBasenameAvatar(walletAddress);
    return { name, avatar };
  }
})
```

## Database Schema

The Base plugin extends the SIWE plugin schema with wallet address support:

```sql
-- Additional table for wallet addresses
CREATE TABLE wallet_address (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);
```

## Brand Guidelines Compliance

When using Base branding, please follow the [official Base Brand Guidelines](https://docs.base.org/base-account/guides/authenticate-users#add-the-base-sign-in-with-base-button):

- Use the official `SignInWithBaseButton` component when possible
- Follow color schemes: Base Blue (#0052FF) for primary actions
- Maintain consistent spacing and typography
- Include the Base logo in custom implementations

## Troubleshooting

### Common Issues

1. **"Base Account SDK not found"**
   ```bash
   npm install @base-org/account
   ```

2. **"method_not_supported" error**
   - The wallet doesn't support `wallet_connect`
   - Use the automatic fallback to `eth_requestAccounts` + `personal_sign`

3. **"Invalid signature" error**
   - Check that the correct chain ID is being used (8453 for Base Mainnet)
   - Ensure the domain matches your app's domain

4. **Network connectivity issues**
   - Base plugin requires internet connectivity for signature verification
   - Ensure your app can connect to Base RPC endpoints

### Debug Mode

Enable debug logging:

```typescript
base({
  // ... other options
  debug: process.env.NODE_ENV === "development"
})
```

## Security Considerations

- **Nonce Management**: Better Auth automatically handles nonce generation and validation
- **Signature Verification**: Uses viem with ERC-6492 support for smart wallet compatibility  
- **Session Security**: Leverages Better Auth's secure session management
- **Domain Binding**: SIWE messages are bound to your app's domain

## API Reference

### Client Methods

- `signInWithBase(options?)` - Main sign-in method
- `getBaseProvider()` - Get Base Account SDK provider
- `isBaseAccountSupported()` - Check wallet compatibility

### Server Plugin

- `base(options)` - Server-side plugin configuration
- Uses SIWE infrastructure with Base-specific optimizations

---

**Note**: This plugin requires `@base-org/account` for full functionality. The fallback implementation works with any EIP-1193 compatible wallet.