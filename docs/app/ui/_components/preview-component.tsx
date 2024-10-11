import { SimpleUsernameAndPass } from "./credential/username-and-password";

export const previewComponent = [
  {
    title: "Simple Credential Login",
    slug: "username-and-password",
    docsLink: "/docs/docs/plugins/username",
    component: <SimpleUsernameAndPass />,
    category: "credential",

    code: {
      react: `
      import { Button } from "@/components/ui/button";
      import { Checkbox } from "@/components/ui/checkbox";
      import { Input } from "@/components/ui/input";
      import { Label } from "@/components/ui/label";
      import clsx from "clsx";
      import { CheckIcon } from "lucide-react";
      import Link from "next/link";
      export const SimpleUsernameAndPass = () => {
        return (
          <div className="w-full max-w-md rounded-xl dark:bg-background shadow-md ring-1 ring-black/5 dark:transform-gpu  dark:[border:1px_solid_rgba(255,255,255,.1)] dark:[box-shadow:0_-20px_80px_-20px_#8686f01f_inset]">
            <form action="#" method="POST" className="p-7 sm:p-11">
              <div className="flex items-start">
                <Link href="/" title="Home">
                  <h1>Logo </h1>
                </Link>
              </div>
              <h1 className="mt-8 text-base/6 font-medium">Welcome back!</h1>
              <p className="mt-1 text-sm/5 text-gray-600">
                Sign in to your account to continue.
              </p>
              <div className="mt-8 space-y-3">
                <Label className="text-sm/5 font-medium">Email</Label>
                <Input
                  required
                  autoFocus
                  type="email"
                  name="email"
                  className={clsx(
                    "block w-full rounded-lg border border-gray-200 shadow ring-1 ring-black/10",
                    "px-[calc(theme(spacing.2)-1px)] py-[calc(theme(spacing[1.5])-1px)] text-base/6 sm:text-sm/6",
                    "data-[focus]:outline data-[focus]:outline-2 data-[focus]:-outline-offset-1 data-[focus]:outline-black"
                  )}
                />
              </div>
              <div className="mt-8 space-y-3">
                <Label className="text-sm/5 font-medium">Password</Label>
                <Input
                  required
                  type="password"
                  name="password"
                  className={clsx(
                    "block w-full rounded-lg border border-gray-200 shadow ring-1 ring-black/10",
                    "px-[calc(theme(spacing.2)-1px)] py-[calc(theme(spacing[1.5])-1px)] text-base/6 sm:text-sm/6",
                    "data-[focus]:outline data-[focus]:outline-2 data-[focus]:-outline-offset-1 data-[focus]:outline-black"
                  )}
                />
              </div>
              <div className="mt-8 flex items-center justify-between text-sm/5">
                <div className="flex items-center gap-3">
                  <Checkbox
                    name="remember-me"
                    className={clsx(
                      "group block size-4 rounded border border-gray-100 shadow ring-1 ring-black/10 focus:outline-none",
                      "data-[checked]:bg-black data-[checked]:ring-black",
                      "data-[focus]:outline data-[focus]:outline-2 data-[focus]:outline-offset-2 data-[focus]:outline-black"
                    )}
                  >
                    <CheckIcon className="fill-white opacity-0 group-data-[checked]:opacity-100" />
                  </Checkbox>
                  <Label>Remember me</Label>
                </div>
                <Link href="#" className="font-medium hover:text-gray-600">
                  Forgot password?
                </Link>
              </div>
              <div className="mt-8 ">
                <Button type="submit" className="w-full">
                  Sign in
                </Button>
              </div>
            </form>
            <div className="m-1.5 rounded-lg  py-4 text-center text-sm/5 ring-1 ring-black/5">
              Not a member?{" "}
              <Link href="#" className="font-medium hover:text-gray-600">
                Create an account
              </Link>
            </div>
          </div>
        );
      };


            `,
      svelte: `

      <script>
        let email = '';
        let password = '';
        let rememberMe = false;
      </script>

      <div class="w-full max-w-md rounded-xl dark:bg-background shadow-md ring-1 ring-black/5 dark:transform-gpu dark:[border:1px_solid_rgba(255,255,255,.1)] dark:[box-shadow:0_-20px_80px_-20px_#8686f01f_inset]">
        <form on:submit|preventDefault={() => console.log(email, password, rememberMe)} class="p-7 sm:p-11">
          <div class="flex items-start">
            <a href="/" title="Home">
              <h1>Logo</h1>
            </a>
          </div>
          <h1 class="mt-8 text-base/6 font-medium">Welcome back!</h1>
          <p class="mt-1 text-sm/5 dark:text-gray-300 text-gray-600">
            Sign in to your account to continue.
          </p>
          <div class="mt-8 space-y-3">
            <label class="text-sm/5 font-medium">Email</label>
            <input
              required
              bind:value={email}
              type="email"
              class="block w-full rounded-lg border border-gray-200 shadow ring-1 ring-black/10 px-[calc(theme(spacing.2)-1px)] py-[calc(theme(spacing[1.5])-1px)] text-base/6 sm:text-sm/6 data-[focus]:outline data-[focus]:outline-2 data-[focus]:-outline-offset-1 data-[focus]:outline-black"
            />
          </div>
          <div class="mt-8 space-y-3">
            <label class="text-sm/5 font-medium">Password</label>
            <input
              required
              bind:value={password}
              type="password"
              class="block w-full rounded-lg border border-gray-200 shadow ring-1 ring-black/10 px-[calc(theme(spacing.2)-1px)] py-[calc(theme(spacing[1.5])-1px)] text-base/6 sm:text-sm/6 data-[focus]:outline data-[focus]:outline-2 data-[focus]:-outline-offset-1 data-[focus]:outline-black"
            />
          </div>
          <div class="mt-8 flex items-center justify-between text-sm/5">
            <div class="flex items-center gap-3">
              <input type="checkbox" bind:checked={rememberMe} class="group block size-4 rounded border border-gray-100 shadow ring-1 ring-black/10 focus:outline-none" />
              <label>Remember me</label>
            </div>
            <a href="#" class="font-medium hover:text-gray-600 dark:hover:text-gray-400">
              Forgot password?
            </a>
          </div>
          <div class="mt-8">
            <button type="submit" class="w-full">Sign in</button>
          </div>
        </form>
        <div class="m-1.5 rounded-lg py-4 text-center text-sm/5 ring-1 ring-black/5">
          Not a member?
          <a href="#" class="font-medium hover:text-gray-600">Create an account</a>
        </div>
      </div>
     `,
      astro: `
      ---
      import { button } from '@/components/ui/button'
      ---

      <button variant="outline">click me!</button>

      `,
      solid: `

                ---
               import { Button } from '@/components/ui/button'
               ---

               <Button variant="outline">Click me!</Button>

       `,

      nuxt: `

      <template>
        <div class="w-full max-w-md rounded-xl dark:bg-background shadow-md ring-1 ring-black/5 dark:transform-gpu dark:[border:1px_solid_rgba(255,255,255,.1)] dark:[box-shadow:0_-20px_80px_-20px_#8686f01f_inset]">
          <form @submit.prevent="handleSubmit" class="p-7 sm:p-11">
            <div class="flex items-start">
              <nuxt-link to="/" title="Home">
                <h1>Logo</h1>
              </nuxt-link>
            </div>
            <h1 class="mt-8 text-base/6 font-medium">Welcome back!</h1>
            <p class="mt-1 text-sm/5 dark:text-gray-300 text-gray-600">
              Sign in to your account to continue.
            </p>
            <div class="mt-8 space-y-3">
              <label class="text-sm/5 font-medium">Email</label>
              <input
                v-model="email"
                required
                type="email"
                class="block w-full rounded-lg border border-gray-200 shadow ring-1 ring-black/10 px-[calc(theme(spacing.2)-1px)] py-[calc(theme(spacing[1.5])-1px)] text-base/6 sm:text-sm/6 data-[focus]:outline data-[focus]:outline-2 data-[focus]:-outline-offset-1 data-[focus]:outline-black"
              />
            </div>
            <div class="mt-8 space-y-3">
              <label class="text-sm/5 font-medium">Password</label>
              <input
                v-model="password"
                required
                type="password"
                class="block w-full rounded-lg border border-gray-200 shadow ring-1 ring-black/10 px-[calc(theme(spacing.2)-1px)] py-[calc(theme(spacing[1.5])-1px)] text-base/6 sm:text-sm/6 data-[focus]:outline data-[focus]:outline-2 data-[focus]:-outline-offset-1 data-[focus]:outline-black"
              />
            </div>
            <div class="mt-8 flex items-center justify-between text-sm/5">
              <div class="flex items-center gap-3">
                <input type="checkbox" v-model="rememberMe" class="group block size-4 rounded border border-gray-100 shadow ring-1 ring-black/10 focus:outline-none" />
                <label>Remember me</label>
              </div>
              <nuxt-link to="#" class="font-medium hover:text-gray-600 dark:hover:text-gray-400">
                Forgot password?
              </nuxt-link>
            </div>
            <div class="mt-8">
              <button type="submit" class="w-full">Sign in</button>
            </div>
          </
                    `,
    },
  },
];
