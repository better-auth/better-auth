import { BackgroundRippleEffect } from "./components/background-ripple-effect";
import { Profile } from "./components/profile";
import { RequestAuth } from "./components/request-auth";
import { useUser } from "./components/user-provider";

function App(): React.JSX.Element {
  const { user, loading } = useUser();

  return (
    <div className="relative flex-1 flex flex-col items-center justify-center">
      {/* Background Ripple Effect */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <BackgroundRippleEffect />
      </div>

      <div className="z-10 flex flex-col items-center gap-6">
        <h3 className="text-3xl sm:text-4xl text-black dark:text-white text-center">
          BETTER-AUTH.
        </h3>

        <p className="text-center wrap-break-word text-sm md:text-base">
          Official demo to showcase{" "}
          <a
            href="https://better-auth.com"
            target="_blank"
            className="italic underline"
          >
            better-auth.
          </a>{" "}
          with Electron.
        </p>

        {loading && (
          <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              className="size-4 animate-spin"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span>Loading...</span>
          </div>
        )}
        {!loading && !user ? <RequestAuth /> : <Profile />}
      </div>
    </div>
  );
}

export default App;
