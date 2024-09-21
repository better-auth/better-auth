import {
  AppWindow,
  Clock,
  Key,
  LucideAArrowDown,
  LucideIcon,
  PlusCircle,
  ScanFace,
  Users2,
  UserSquare2,
} from "lucide-react";
import { ReactNode, SVGProps } from "react";
import { Icons } from "./icons";

interface Content {
  title: string;
  href?: string;
  Icon: ((props?: SVGProps<any>) => ReactNode) | LucideIcon;
  list: {
    title: string;
    href: string;
    icon: ((props?: SVGProps<any>) => ReactNode) | LucideIcon;
    group?: boolean;
  }[];
}

export const contents: Content[] = [
  {
    title: "Get Started",
    Icon: () => (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="1.4em"
        height="1.4em"
        viewBox="0 0 24 24"
      >
        <path
          fill="currentColor"
          d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2m-1 14H9V8h2zm1 0V8l5 4z"
        />
      </svg>
    ),
    list: [
      {
        title: "Introduction",
        href: "/docs/introduction",
        icon: () => (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="1.2em"
            height="1.2em"
            viewBox="0 0 256 256"
          >
            <path
              fill="currentColor"
              d="M232 48h-64a32 32 0 0 0-32 32v87.73a8.17 8.17 0 0 1-7.47 8.25a8 8 0 0 1-8.53-8V80a32 32 0 0 0-32-32H24a8 8 0 0 0-8 8v144a8 8 0 0 0 8 8h72a24 24 0 0 1 24 23.94a7.9 7.9 0 0 0 5.12 7.55A8 8 0 0 0 136 232a24 24 0 0 1 24-24h72a8 8 0 0 0 8-8V56a8 8 0 0 0-8-8m-24 120h-39.73a8.17 8.17 0 0 1-8.25-7.47a8 8 0 0 1 8-8.53h39.73a8.17 8.17 0 0 1 8.25 7.47a8 8 0 0 1-8 8.53m0-32h-39.73a8.17 8.17 0 0 1-8.25-7.47a8 8 0 0 1 8-8.53h39.73a8.17 8.17 0 0 1 8.25 7.47a8 8 0 0 1-8 8.53m0-32h-39.73a8.17 8.17 0 0 1-8.27-7.47a8 8 0 0 1 8-8.53h39.73a8.17 8.17 0 0 1 8.27 7.47a8 8 0 0 1-8 8.53"
            />
          </svg>
        ),
      },
      {
        title: "Installation",
        href: "/docs/installation",
        icon: () => (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="1.2em"
            height="1.2em"
            viewBox="0 0 24 24"
          >
            <path
              fill="currentColor"
              fillRule="evenodd"
              d="M2 12c0-4.714 0-7.071 1.464-8.536C4.93 2 7.286 2 12 2c4.714 0 7.071 0 8.535 1.464C22 4.93 22 7.286 22 12c0 4.714 0 7.071-1.465 8.535C19.072 22 16.714 22 12 22s-7.071 0-8.536-1.465C2 19.072 2 16.714 2 12m10-5.75a.75.75 0 0 1 .75.75v5.19l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06l1.72 1.72V7a.75.75 0 0 1 .75-.75m-4 10a.75.75 0 0 0 0 1.5h8a.75.75 0 0 0 0-1.5z"
              clipRule="evenodd"
            />
          </svg>
        ),
      },
      {
        title: "Basic Usage",
        href: "/docs/basic-usage",
        icon: () => (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="1.2em"
            height="1.2em"
            viewBox="0 0 16 16"
          >
            <path
              fill="currentColor"
              d="M2 3.75C2 2.784 2.784 2 3.75 2h8.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25zM6 6.5a.5.5 0 0 0-1 0v4a.5.5 0 0 0 1 0zM8 8a.5.5 0 0 0-.5.5v2a.5.5 0 0 0 1 0v-2A.5.5 0 0 0 8 8m3-2.5a.5.5 0 0 0-1 0v5a.5.5 0 0 0 1 0z"
            ></path>
          </svg>
        ),
      },
    ],
  },
  {
    title: "Authentication",
    Icon: () => (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="1.4em"
        height="1.4em"
        viewBox="0 0 24 24"
      >
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M10 4h4c3.771 0 5.657 0 6.828 1.172C22 6.343 22 8.229 22 12c0 3.771 0 5.657-1.172 6.828C19.657 20 17.771 20 14 20h-4c-3.771 0-5.657 0-6.828-1.172C2 17.657 2 15.771 2 12c0-3.771 0-5.657 1.172-6.828C4.343 4 6.229 4 10 4m3.25 5a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5a.75.75 0 0 1-.75-.75m1 3a.75.75 0 0 1 .75-.75h4a.75.75 0 0 1 0 1.5h-4a.75.75 0 0 1-.75-.75m1 3a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 0 1.5h-3a.75.75 0 0 1-.75-.75M11 9a2 2 0 1 1-4 0a2 2 0 0 1 4 0m-2 8c4 0 4-.895 4-2s-1.79-2-4-2s-4 .895-4 2s0 2 4 2"
          clipRule="evenodd"
        />
      </svg>
    ),
    list: [
      {
        title: "Email & Password",
        href: "/docs/authentication/email-password",
        icon: () => (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="1.2em"
            height="1.2em"
            viewBox="0 0 24 24"
          >
            <path
              fill="currentColor"
              fillRule="evenodd"
              d="M3.172 5.172C2 6.343 2 8.229 2 12c0 3.771 0 5.657 1.172 6.828C4.343 20 6.229 20 10 20h4c3.771 0 5.657 0 6.828-1.172C22 17.657 22 15.771 22 12c0-3.771 0-5.657-1.172-6.828C19.657 4 17.771 4 14 4h-4C6.229 4 4.343 4 3.172 5.172M8 13a1 1 0 1 0 0-2a1 1 0 0 0 0 2m5-1a1 1 0 1 1-2 0a1 1 0 0 1 2 0m3 1a1 1 0 1 0 0-2a1 1 0 0 0 0 2"
              clipRule="evenodd"
            />
          </svg>
        ),
      },
      {
        title: "Social Sign-On",
        group: true,
        href: "/docs/authentication/social-providers",
        icon: () => (
          <svg>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm4.59-12.42L10 14.17l-2.59-2.58L6 13l4 4 8-8z"></path>
          </svg>
        ),
      },
      {
        title: "Apple",
        href: "/docs/authentication/apple",
        icon: () => (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="1.2em"
            height="1.2em"
            viewBox="0 0 20 20"
          >
            <path
              fill="currentColor"
              fillRule="evenodd"
              d="M14.122 4.682c1.35 0 2.781.743 3.8 2.028c-3.34 1.851-2.797 6.674.578 7.963c-.465 1.04-.687 1.505-1.285 2.426c-.835 1.284-2.01 2.884-3.469 2.898c-1.295.012-1.628-.853-3.386-.843c-1.758.01-2.125.858-3.42.846c-1.458-.014-2.573-1.458-3.408-2.743C1.198 13.665.954 9.45 2.394 7.21C3.417 5.616 5.03 4.683 6.548 4.683c1.545 0 2.516.857 3.794.857c1.24 0 1.994-.858 3.78-.858M13.73 0c.18 1.215-.314 2.405-.963 3.247c-.695.902-1.892 1.601-3.05 1.565c-.21-1.163.332-2.36.99-3.167C11.43.755 12.67.074 13.73 0"
            />
          </svg>
        ),
      },

      {
        title: "Discord",
        href: "/docs/authentication/discord",
        icon: () => (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="1.2em"
            height="1.2em"
            viewBox="0 0 24 24"
          >
            <path
              fill="currentColor"
              d="M18.59 5.89c-1.23-.57-2.54-.99-3.92-1.23c-.17.3-.37.71-.5 1.04c-1.46-.22-2.91-.22-4.34 0c-.14-.33-.34-.74-.51-1.04c-1.38.24-2.69.66-3.92 1.23c-2.48 3.74-3.15 7.39-2.82 10.98c1.65 1.23 3.24 1.97 4.81 2.46c.39-.53.73-1.1 1.03-1.69c-.57-.21-1.11-.48-1.62-.79c.14-.1.27-.21.4-.31c3.13 1.46 6.52 1.46 9.61 0c.13.11.26.21.4.31c-.51.31-1.06.57-1.62.79c.3.59.64 1.16 1.03 1.69c1.57-.49 3.17-1.23 4.81-2.46c.39-4.17-.67-7.78-2.82-10.98Zm-9.75 8.78c-.94 0-1.71-.87-1.71-1.94s.75-1.94 1.71-1.94s1.72.87 1.71 1.94c0 1.06-.75 1.94-1.71 1.94m6.31 0c-.94 0-1.71-.87-1.71-1.94s.75-1.94 1.71-1.94s1.72.87 1.71 1.94c0 1.06-.75 1.94-1.71 1.94"
            />
          </svg>
        ),
      },
      {
        title: "Facebook",
        href: "/docs/authentication/facebook",
        icon: () => (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="1.2em"
            height="1.2em"
            viewBox="0 0 24 24"
          >
            <g fill="none">
              <path d="M24 0v24H0V0zM12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z"></path>
              <path
                fill="currentColor"
                d="M13.5 21.888C18.311 21.164 22 17.013 22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 5.013 3.689 9.165 8.5 9.888V15H9a1.5 1.5 0 0 1 0-3h1.5v-2A3.5 3.5 0 0 1 14 6.5h.5a1.5 1.5 0 0 1 0 3H14a.5.5 0 0 0-.5.5v2H15a1.5 1.5 0 0 1 0 3h-1.5z"
              ></path>
            </g>
          </svg>
        ),
      },
      {
        title: "Github",
        href: "/docs/authentication/github",
        icon: () => (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="1em"
            height="1em"
            viewBox="0 0 15 15"
          >
            <path
              fill="currentColor"
              fillRule="evenodd"
              d="M7.5.25a7.25 7.25 0 0 0-2.292 14.13c.363.066.495-.158.495-.35c0-.172-.006-.628-.01-1.233c-2.016.438-2.442-.972-2.442-.972c-.33-.838-.805-1.06-.805-1.06c-.658-.45.05-.441.05-.441c.728.051 1.11.747 1.11.747c.647 1.108 1.697.788 2.11.602c.066-.468.254-.788.46-.969c-1.61-.183-3.302-.805-3.302-3.583a2.8 2.8 0 0 1 .747-1.945c-.075-.184-.324-.92.07-1.92c0 0 .61-.194 1.994.744A6.963 6.963 0 0 1 7.5 3.756A6.97 6.97 0 0 1 9.315 4c1.384-.938 1.992-.743 1.992-.743c.396.998.147 1.735.072 1.919c.465.507.745 1.153.745 1.945c0 2.785-1.695 3.398-3.31 3.577c.26.224.492.667.492 1.343c0 .97-.009 1.751-.009 1.989c0 .194.131.42.499.349A7.25 7.25 0 0 0 7.499.25"
              clipRule="evenodd"
            />
          </svg>
        ),
      },
      {
        title: "Google",
        href: "/docs/authentication/google",
        icon: () => (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="1em"
            height="1em"
            viewBox="0 0 56 56"
          >
            <path
              fill="currentColor"
              fillRule="evenodd"
              d="M28.458 5c6.167 0 11.346 2.2 15.368 5.804l.323.295l-6.62 6.464c-1.695-1.59-4.666-3.493-9.07-3.493c-6.204 0-11.47 4.093-13.372 9.749c-.47 1.46-.756 3.023-.756 4.64c0 1.615.287 3.18.782 4.639c1.877 5.656 7.142 9.748 13.345 9.748c3.347 0 5.928-.886 7.881-2.176l.251-.17l.307-.222c2.813-2.108 4.144-5.084 4.46-7.169l.03-.22h-12.93v-8.705h22.025c.339 1.46.495 2.867.495 4.795c0 7.142-2.554 13.163-6.985 17.255c-3.884 3.597-9.201 5.682-15.535 5.682c-9.031 0-16.85-5.102-20.772-12.57l-.184-.358l-.222-.457A23.45 23.45 0 0 1 5 28.458c0-3.6.827-7.01 2.28-10.073l.222-.457l.184-.357C11.608 10.1 19.426 5 28.458 5"
            />
          </svg>
        ),
      },
      {
        title: "Twitch",
        href: "/docs/authentication/twitch",
        icon: () => (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="1em"
            height="1em"
            viewBox="0 0 24 24"
          >
            <path
              fill="currentColor"
              fillRule="evenodd"
              d="M3.9 2.5a.9.9 0 0 0-.9.9v14.194a.9.9 0 0 0 .9.9h4.116v3.03a.7.7 0 0 0 1.194.494l3.525-3.524h4.643a.9.9 0 0 0 .636-.264l2.722-2.722a.9.9 0 0 0 .264-.636V3.4a.9.9 0 0 0-.9-.9zm7.319 5.2a.75.75 0 0 0-1.5 0v4.272a.75.75 0 1 0 1.5 0zm5.016 0a.75.75 0 0 0-1.5 0v4.272a.75.75 0 1 0 1.5 0z"
              clipRule="evenodd"
            ></path>
          </svg>
        ),
      },
      {
        title: "X (Twitter)",
        href: "/docs/authentication/twitter",
        icon: () => (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="0.88em"
            height="1em"
            viewBox="0 0 448 512"
          >
            <path
              fill="currentColor"
              d="M64 32C28.7 32 0 60.7 0 96v320c0 35.3 28.7 64 64 64h320c35.3 0 64-28.7 64-64V96c0-35.3-28.7-64-64-64zm297.1 84L257.3 234.6L379.4 396h-95.6L209 298.1L123.3 396H75.8l111-126.9L69.7 116h98l67.7 89.5l78.2-89.5zm-37.8 251.6L153.4 142.9h-28.3l171.8 224.7h26.3z"
            ></path>
          </svg>
        ),
      },
    ],
  },
  {
    title: "Integrations",
    Icon: () => (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="1.3em"
        height="1.3em"
        viewBox="0 0 48 48"
      >
        <path
          fill="currentColor"
          stroke="currentColor"
          stroke-linejoin="round"
          stroke-width="4"
          d="M18 6H8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Zm0 22H8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V30a2 2 0 0 0-2-2ZM40 6H30a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Zm0 22H30a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V30a2 2 0 0 0-2-2Z"
        ></path>
      </svg>
    ),
    list: [
      {
        group: true,
        title: "Frameworks",
        href: "/docs/integrations",
        icon: LucideAArrowDown,
      },
      {
        title: "Next",
        icon: Icons.nextJS,
        href: "/docs/integrations/next",
      },
      {
        title: "Nuxt",
        icon: Icons.nuxt,
        href: "/docs/integrations/nuxt",
      },
      {
        title: "Svelte Kit",
        icon: Icons.svelteKit,
        href: "/docs/integrations/svelte-kit",
      },
      {
        title: "Hono",
        icon: Icons.hono,
        href: "/docs/integrations/hono",
      },
      {
        title: "Solid Start",
        icon: Icons.solidStart,
        href: "/docs/integrations/solid-start",
      },
    ],
  },
  {
    title: "Plugins",
    Icon: () => (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="1.4em"
        height="1.4em"
        viewBox="0 0 24 24"
      >
        <g fill="none">
          <path d="M24 0v24H0V0zM12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035c-.01-.004-.019-.001-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427c-.002-.01-.009-.017-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093c.012.004.023 0 .029-.008l.004-.014l-.034-.614c-.003-.012-.01-.02-.02-.022m-.715.002a.023.023 0 0 0-.027.006l-.006.014l-.034.614c0 .012.007.02.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z" />
          <path
            fill="currentColor"
            d="M15 20a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2zm0-18a1 1 0 0 1 .993.883L16 3v3h2a2 2 0 0 1 1.995 1.85L20 8v5a6 6 0 0 1-5.775 5.996L14 19h-4a6 6 0 0 1-5.996-5.775L4 13V8a2 2 0 0 1 1.85-1.995L6 6h2V3a1 1 0 0 1 1.993-.117L10 3v3h4V3a1 1 0 0 1 1-1"
          />
        </g>
      </svg>
    ),
    list: [
      {
        title: "Authentication",
        group: true,
        href: "/docs/plugins/1st-party-plugins",
        icon: LucideAArrowDown,
      },

      {
        title: "Two Factor",
        icon: ScanFace,
        href: "/docs/plugins/2fa",
      },
      {
        title: "Username",
        icon: UserSquare2,
        href: "/docs/plugins/username",
      },
      {
        title: "Passkey",
        href: "/docs/plugins/passkey",
        icon: () => (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="1.2em"
            height="1.2em"
            viewBox="0 0 24 24"
          >
            <path
              fill="currentColor"
              d="M18 16.663a3.5 3.5 0 0 1-2-3.163a3.5 3.5 0 1 1 4.5 3.355V17l1.146 1.146a.5.5 0 0 1 0 .708L20.5 20l1.161 1.161a.5.5 0 0 1 .015.692l-1.823 1.984a.5.5 0 0 1-.722.015l-.985-.984a.5.5 0 0 1-.146-.354zM20.5 13a1 1 0 1 0-2 0a1 1 0 0 0 2 0M17 17.242v3.69c-1.36.714-3.031 1.07-5 1.07c-3.42 0-5.944-1.073-7.486-3.237a2.75 2.75 0 0 1-.51-1.596v-.92a2.25 2.25 0 0 1 2.249-2.25h8.775A4.5 4.5 0 0 0 17 17.243M12 2.005a5 5 0 1 1 0 10a5 5 0 0 1 0-10"
            ></path>
          </svg>
        ),
      },
      {
        title: "Authorization",
        group: true,
        href: "/docs/plugins/1st-party-plugins",
        icon: LucideAArrowDown,
      },
      {
        title: "Organization",
        icon: Users2,
        href: "/docs/plugins/organization",
      },
      {
        title: "Utility",
        group: true,
        href: "/docs/plugins/1st-party-plugins",
        icon: LucideAArrowDown,
      },
      {
        title: "Rate Limit",
        icon: Clock,
        href: "/docs/plugins/rate-limit",
      },
      {
        title: "Bearer",
        icon: Key,
        href: "/docs/plugins/bearer",
      },
      // {
      //   title: "Guide",
      //   group: true,
      //   href: "/docs/plugins/guide",
      //   icon: LucideAArrowDown,
      // },
    ],
  },
  // {
  //   title: "Examples",
  //   list: [
  //     {
  //       title: "Next JS",
  //       href: "/docs/examples/next-js",
  //       icon: Icons.nextJS,
  //     },
  //   ],
  //   Icon: AppWindow,
  // },
];
