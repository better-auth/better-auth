import { Button } from "./ui/button";
import { useState } from "react";
import { cn } from "@renderer/lib/utils";
import type { ElectronRequestAuthOptions } from "@better-auth/electron/client";

export function RequestAuth() {
  const [openedBrowser, setOpenedBrowser] = useState(false);

  const handleRequestAuth =
    (opts?: ElectronRequestAuthOptions | undefined) => () => {
      void window.requestAuth(opts);
      setTimeout(() => {
        setOpenedBrowser(true);
      }, 500);
    };

  return (
    <>
      <div className="grid grid-cols-2 gap-2 w-full max-w-sm px-8">
        <Button
          size="lg"
          onClick={handleRequestAuth()}
          className="col-span-2 mb-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="1.2em"
            height="1.2em"
            viewBox="0 0 24 24"
          >
            <path
              fill="currentColor"
              d="M5 3H3v4h2V5h14v14H5v-2H3v4h18V3zm12 8h-2V9h-2V7h-2v2h2v2H3v2h10v2h-2v2h2v-2h2v-2h2z"
            />
          </svg>
          Sign in with Browser
        </Button>

        <Button
          onClick={handleRequestAuth({
            provider: "google",
          })}
          variant="outline"
          aria-label="Sign in with Google"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="0.98em"
            height="1em"
            viewBox="0 0 256 262"
          >
            <path
              fill="#4285F4"
              d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622l38.755 30.023l2.685.268c24.659-22.774 38.875-56.282 38.875-96.027"
            ></path>
            <path
              fill="#34A853"
              d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055c-34.523 0-63.824-22.773-74.269-54.25l-1.531.13l-40.298 31.187l-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1"
            ></path>
            <path
              fill="#FBBC05"
              d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82c0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602z"
            ></path>
            <path
              fill="#EB4335"
              d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0C79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251"
            ></path>
          </svg>
          <span className="hidden sm:inline">Google</span>
        </Button>
        <Button
          onClick={handleRequestAuth({
            provider: "github",
          })}
          variant="outline"
          aria-label="Sign in with GitHub"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="1.2em"
            height="1.2em"
            viewBox="0 0 24 24"
          >
            <path
              fill="currentColor"
              d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2"
            ></path>
          </svg>
          <span className="hidden sm:inline">GitHub</span>
        </Button>
        <Button
          onClick={handleRequestAuth({
            provider: "microsoft",
          })}
          variant="outline"
          aria-label="Sign in with Microsoft"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="1em"
            height="1em"
            viewBox="0 0 24 24"
          >
            <path
              fill="currentColor"
              d="M2 3h9v9H2zm9 19H2v-9h9zM21 3v9h-9V3zm0 19h-9v-9h9z"
            ></path>
          </svg>
          <span className="hidden sm:inline">Microsoft</span>
        </Button>
        <Button
          onClick={handleRequestAuth({
            provider: "vercel",
          })}
          variant="outline"
          aria-label="Sign in with Vercel"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="1em"
            height="1em"
            viewBox="0 0 256 222"
            className="dark:fill-white fill-black"
          >
            <path d="m128 0l128 221.705H0z" />
          </svg>
          <span className="hidden sm:inline">Vercel</span>
        </Button>
      </div>
      <div
        className={cn(
          "transition-all duration-150 ease-in-out overflow-hidden",
          openedBrowser ? "max-h-fit mt-4" : "max-h-0",
        )}
      >
        <p
          className={cn(
            "text-muted-foreground text-center wrap-break-word text-xs md:text-sm",
            "delay-150 transition-opacity",
            openedBrowser ? "opacity-100" : "opacity-0",
          )}
        >
          A browser window has been opened for authentication.
          <br />
          Please complete the process there.
        </p>
      </div>
    </>
  );
}
