import { GridPattern } from "@/components/landing/grid-pattern";
import { ComponentDisplay } from "./component-display";

export default function AuthUIHero() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center overflow-hidden no-visible-scrollbar px-6 md:px-0">
      <GridPattern
        className="absolute inset-x-0 -top-14 -z-10 h-full w-full dark:fill-secondary/30 fill-neutral-100 dark:stroke-secondary/30 stroke-neutral-700/5 [mask-image:linear-gradient(to_bottom_left,white_40%,transparent_50%)]"
        yOffset={-96}
        interactive
      />
      <main className="flex flex-col gap-4 row-start-2 items-center justify-center">
        <div className="flex flex-col gap-1">
          <h3 className="font-bold text-4xl text-black dark:text-white text-center">
            Better Auth UI.
          </h3>
          <p className="text-center text-gray-700 dark:text-gray-300 max-w-md break-words text-sm md:text-base">
            Explore a tuned auth UI that you can copy / paste with{" "}
            <a
              href="https://better-auth.com"
              target="_blank"
              className="italic text-dark dark:text-white underline"
            >
              better-auth.
            </a>{" "}
            features and capabilities. <br />
          </p>
        </div>
      </main>
    </div>
  );
}
