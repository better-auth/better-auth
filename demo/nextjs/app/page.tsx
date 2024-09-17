import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import Link from "next/link";

export default async function Home() {
  const session = await auth.api.getSession({
    headers: headers()
  })

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <main className="flex flex-col gap-8 row-start-2 items-center justify-center">
        <div className="flex flex-col gap-1">
          <h3 className="font-bold text-5xl text-black dark:text-white text-center">
            Better Auth.
          </h3>
          <p className="text-center break-words">
            Official demo to showcase <span className="italic underline">better-auth.</span> features and capabilities. <br />
            <span className="text-xs text-muted-foreground text-center">
              * All auth related features implemented on this demo are natively supported by <span className="italic">better-auth. (
                no custom backend code is written
                )</span>
            </span>
          </p>
        </div>
        <div>

        </div>

        <div className="gap-4 w-full flex items-center justify-center">
          {
            session ? (
              <div>
                <Link href="/dashboard">
                  <Button className="gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 24 24"><path fill="currentColor" d="M5 21q-.825 0-1.412-.587T3 19V5q0-.825.588-1.412T5 3h6v18zm8 0v-9h8v7q0 .825-.587 1.413T19 21zm0-11V3h6q.825 0 1.413.588T21 5v5z"></path></svg>
                    Dashboard
                  </Button>
                </Link>
              </div>
            ) : (
              <Link href="/sign-in">
                <Button className="gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 24 24"><path fill="currentColor" d="M5 3H3v4h2V5h14v14H5v-2H3v4h18V3zm12 8h-2V9h-2V7h-2v2h2v2H3v2h10v2h-2v2h2v-2h2v-2h2z"></path></svg>
                  Get Started
                </Button>
              </Link>
            )
          }
        </div>
      </main>
    </div>
  );
}
