import "./global.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { UserProvider } from "./components/user-provider";
import App from "./App";
import { ThemeProvider } from "./components/theme-provider";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider
      defaultTheme="system"
      storageKey="better-auth-demo-electron-theme"
    >
      <UserProvider>
        <App />
      </UserProvider>
    </ThemeProvider>
  </StrictMode>,
);
