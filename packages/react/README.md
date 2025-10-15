# React

This is a [React](https://reactjs.org/) component library for [Better Auth](https://github.com/better-auth/better-auth).

## Installation

```bash
npm install @better-auth/react
```

## Usage

```tsx
import { BetterAuthProvider } from "@better-auth/react";

function App() {
  return (
    <BetterAuthProvider
      options={{
        // Your options here
      }}
    >
      {/* Your app here */}
    </BetterAuthProvider>
  );
}
```