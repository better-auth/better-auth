"use client";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { AsideLink } from "@/components/ui/aside-link";
import { FadeIn, FadeInStagger } from "@/components/ui/fade-in";
import { Key, LucideAArrowDown, LucideIcon, MailCheck, ScanFace, Search, Users2, UserSquare2 } from "lucide-react";
import { ReactNode, Suspense, SVGProps, useState } from "react";
import {
    SearchDialog,
    type SharedProps
} from 'fumadocs-ui/components/dialog/search'
import { useSearchContext } from "fumadocs-ui/provider";
import { Input } from "./ui/input";
import { usePathname } from "next/navigation";
export default function ArticleLayout() {
    const { setOpenSearch } = useSearchContext()
    const pathname = usePathname()
    function getDefaultValue() {
        const defaultValue = contents.findIndex((item) => item.list.some((listItem) => listItem.href === pathname))
        return defaultValue === -1 ? 0 : defaultValue
    }
    return (
        <aside className="border-r border-lines md:block hidden overflow-y-auto min-w-[--fd-sidebar-width] h-full sticky top-[60px] min-h-[92dvh]">
            <div className="flex items-center gap-2 p-2 px-4 border-b bg-gradient-to-br from-stone-900 to-stone-950/80" onClick={() => {
                setOpenSearch(true)
            }}>
                <Search className="h-4 w-4" />
                <p className="text-sm bg-gradient-to-tr from-gray-200 to-stone-500 bg-clip-text text-transparent">
                    Search documentation...
                </p>
            </div>
            <Accordion type="single" collapsible defaultValue={`item-${getDefaultValue()}`}>
                {contents.map((item, i) => (
                    <AccordionItem value={`item-${i}`} key={item.title}>
                        <AccordionTrigger
                            className="border-b border-lines px-5 py-2.5 text-left"
                        >
                            <div className="flex items-center gap-2">
                                {item.Icon && <item.Icon />}
                                {item.title}
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className=" space-y-1  p-0">
                            <FadeInStagger faster>
                                {item.list.map((listItem, j) => (
                                    <FadeIn key={listItem.title} >
                                        <Suspense fallback={<>Loading...</>}>
                                            {
                                                listItem.group ?
                                                    <div className="flex flex-row gap-2 items-center mx-5 my-1  ">

                                                        <p className="text-sm bg-gradient-to-tr from-gray-200 to-stone-500 bg-clip-text text-transparent">
                                                            {listItem.title}
                                                        </p>
                                                        <line
                                                            className="flex-grow h-px bg-gradient-to-r from-orange-500/40 to-stone-600/60"
                                                        />

                                                    </div>
                                                    : <AsideLink
                                                        href={listItem.href}
                                                        startWith="/docs"
                                                        title={listItem.title}
                                                    >
                                                        <listItem.icon className="w-4 h-4 text-white" />
                                                        {listItem.title}
                                                    </AsideLink>
                                            }

                                        </Suspense>
                                    </FadeIn>
                                ))}
                            </FadeInStagger>
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        </aside>
    );
}

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

const contents: Content[] = [
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
                    <svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 24 24"><path fill="currentColor" d="M21 2H3c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2M10 19.4l-1.6.6C6.9 18.6 6 16.6 6 14.5s.9-4.1 2.4-5.5l1.6.6c-1.3 1.1-2 3-2 4.9s.7 3.7 2 4.9m5.6.6l-1.6-.6c1.3-1.2 2-3 2-4.9s-.7-3.7-2-4.9l1.6-.6c1.5 1.4 2.4 3.4 2.4 5.5s-.9 4.1-2.4 5.5M21 7H3V4h18z"></path></svg>
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
                group: true,
                href: "/docs/email-password",
                icon: () => (
                    <svg>
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm4.59-12.42L10 14.17l-2.59-2.58L6 13l4 4 8-8z"></path>
                    </svg>
                )
            },

            {
                title: "Sign-In & Sign-Up",
                href: "/docs/email-password/sign-in-and-sign-up",
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
                )
            },
            {
                title: "Password Reset",
                href: "/docs/email-password/password-reset",
                icon: () => (
                    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M15.75 2a.75.75 0 0 0-1.5 0v20a.75.75 0 0 0 1.5 0v-2.006c2.636-.027 4.104-.191 5.078-1.166C22 17.657 22 15.771 22 12s0-5.657-1.172-6.828c-.974-.975-2.442-1.139-5.078-1.166z"></path><path fill="currentColor" fillRule="evenodd" d="M3.172 18.828C4.343 20 6.229 20 10 20h3V4h-3C6.229 4 4.343 4 3.172 5.172S2 8.229 2 12s0 5.657 1.172 6.828M13 12a1 1 0 1 0-2 0a1 1 0 0 0 2 0m-4 0a1 1 0 1 1-2 0a1 1 0 0 1 2 0" clipRule="evenodd"></path></svg>
                )
            },
            {
                title: "Configuration",
                href: "/docs/email-password/configuration",
                icon: () => (
                    <svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 48 48"><defs><mask id="ipSConfig0"><g fill="none" stroke-linejoin="round" stroke-width="4"><path fill="#fff" stroke="#fff" d="m24 4l-6 6h-8v8l-6 6l6 6v8h8l6 6l6-6h8v-8l6-6l-6-6v-8h-8z"></path><path fill="#000" stroke="#000" d="M24 30a6 6 0 1 0 0-12a6 6 0 0 0 0 12Z"></path></g></mask></defs><path fill="currentColor" d="M0 0h48v48H0z" mask="url(#ipSConfig0)"></path></svg>

                )
            },
            {
                title: "Social Sign-On",
                group: true,
                href: "/docs/providers/social-providers",
                icon: () => (
                    <svg>
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm4.59-12.42L10 14.17l-2.59-2.58L6 13l4 4 8-8z"></path>
                    </svg>
                )
            },
            {
                title: "Apple",
                href: "/docs/providers/apple",
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
                href: "/docs/providers/discord",
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
                href: "/docs/providers/facebook",
                icon: () => (
                    <svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 24 24"><g fill="none"><path d="M24 0v24H0V0zM12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z"></path><path fill="currentColor" d="M13.5 21.888C18.311 21.164 22 17.013 22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 5.013 3.689 9.165 8.5 9.888V15H9a1.5 1.5 0 0 1 0-3h1.5v-2A3.5 3.5 0 0 1 14 6.5h.5a1.5 1.5 0 0 1 0 3H14a.5.5 0 0 0-.5.5v2H15a1.5 1.5 0 0 1 0 3h-1.5z"></path></g></svg>
                ),
            },
            {
                title: "Github",
                href: "/docs/providers/github",
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
                href: "/docs/providers/google",
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
                href: "/docs/providers/twitch",
                icon: () => (
                    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" fillRule="evenodd" d="M3.9 2.5a.9.9 0 0 0-.9.9v14.194a.9.9 0 0 0 .9.9h4.116v3.03a.7.7 0 0 0 1.194.494l3.525-3.524h4.643a.9.9 0 0 0 .636-.264l2.722-2.722a.9.9 0 0 0 .264-.636V3.4a.9.9 0 0 0-.9-.9zm7.319 5.2a.75.75 0 0 0-1.5 0v4.272a.75.75 0 1 0 1.5 0zm5.016 0a.75.75 0 0 0-1.5 0v4.272a.75.75 0 1 0 1.5 0z" clipRule="evenodd"></path></svg>
                )
            },
            {
                title: "X (Twitter)",
                href: "/docs/providers/twitter",
                icon: () => (
                    <svg xmlns="http://www.w3.org/2000/svg" width="0.88em" height="1em" viewBox="0 0 448 512"><path fill="currentColor" d="M64 32C28.7 32 0 60.7 0 96v320c0 35.3 28.7 64 64 64h320c35.3 0 64-28.7 64-64V96c0-35.3-28.7-64-64-64zm297.1 84L257.3 234.6L379.4 396h-95.6L209 298.1L123.3 396H75.8l111-126.9L69.7 116h98l67.7 89.5l78.2-89.5zm-37.8 251.6L153.4 142.9h-28.3l171.8 224.7h26.3z"></path></svg>
                )
            }
        ],
    },
    {
        title: "Integrations",
        Icon: () => (
            <svg xmlns="http://www.w3.org/2000/svg" width="1.3em" height="1.3em" viewBox="0 0 48 48"><path fill="currentColor" stroke="currentColor" stroke-linejoin="round" stroke-width="4" d="M18 6H8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Zm0 22H8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V30a2 2 0 0 0-2-2ZM40 6H30a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Zm0 22H30a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V30a2 2 0 0 0-2-2Z"></path></svg>
        ),
        list: [
            {
                group: true,
                title: "Frameworks",
                href: "/docs/integrations",
                icon: LucideAArrowDown
            },
            {
                title: "Hono",
                icon: () => (
                    <svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 256 330"><path fill="#9E9494" d="M134.129.029q1.315-.17 2.319.662a1256 1256 0 0 1 69.573 93.427q24.141 36.346 41.082 76.862q27.055 72.162-28.16 125.564q-48.313 40.83-111.318 31.805q-75.312-15.355-102.373-87.133Q-1.796 217.85.614 193.51q4.014-41.896 19.878-80.838q6.61-15.888 17.228-29.154a382 382 0 0 1 16.565 21.203q3.66 3.825 7.62 7.289Q92.138 52.013 134.13.029" opacity=".993"></path><path fill="#3C2020" d="M129.49 53.7q36.47 42.3 65.93 90.114a187.3 187.3 0 0 1 15.24 33.13q12.507 49.206-26.836 81.169q-38.05 26.774-83.488 15.902q-48.999-15.205-56.653-65.929q-1.857-15.993 3.314-31.142a225.4 225.4 0 0 1 17.89-35.78l19.878-29.155a5510 5510 0 0 0 44.726-58.31"></path></svg>
                ),
                href: "/docs/integrations/hono",
            },
            {
                title: "Next",
                icon: () => (
                    <svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 24 24"><path fill="currentColor" d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10s-4.477 10-10 10m4-14h-1.35v4H16zM9.346 9.71l6.059 7.828l1.054-.809L9.683 8H8v7.997h1.346z"></path></svg>
                ),
                href: "/docs/integrations/next",
            },
            {
                title: "Nuxt",
                icon: () => (
                    <svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 512 512"><path fill="currentColor" d="M200.662 81.35L0 430.65h130.774l139.945-239.803zm134.256 40.313l-39.023 69.167l138.703 239.82H512zm-51.596 91.052L155.924 430.651h253.485z"></path></svg>
                ),
                href: "/docs/integrations/nuxt",
            },
            {
                title: "Svelte Kit",
                icon: () => (
                    <svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 426 512"><path fill="currentColor" d="M403.508 229.23C491.235 87.7 315.378-58.105 190.392 23.555L71.528 99.337c-57.559 37.487-82.55 109.513-47.45 183.53c-87.761 133.132 83.005 289.03 213.116 205.762l118.864-75.782c64.673-42.583 79.512-116.018 47.45-183.616m-297.592-80.886l118.69-75.739c77.973-46.679 167.756 34.942 135.388 110.992c-19.225-15.274-40.65-24.665-56.923-28.894c6.186-24.57-22.335-42.796-42.174-30.106l-118.95 75.48c-29.411 20.328 1.946 62.138 31.014 44.596l45.33-28.895c101.725-57.403 198 80.425 103.38 147.975l-118.692 75.739C131.455 485.225 34.11 411.96 67.592 328.5c17.786 13.463 36.677 23.363 56.923 28.894c-4.47 28.222 24.006 41.943 42.476 30.365L285.64 312.02c29.28-21.955-2.149-61.692-30.97-44.595l-45.504 28.894c-100.56 58.77-199.076-80.42-103.25-147.975"></path></svg>
                ),
                href: "/docs/integrations/svelte-kit",
            },
            {
                title: "Solid Start",
                icon: () => (
                    <svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 128 128"><path fill="currentColor" d="M61.832 4.744c-3.205.058-6.37.395-9.45 1.07l-2.402.803c-4.806 1.603-8.813 4.005-11.216 7.21l-1.602 2.404l-12.017 20.828l.166.031c-4.785 5.823-5.007 14.07-.166 21.6c1.804 2.345 4.073 4.431 6.634 6.234l-15.445 4.982L.311 97.946s42.46 32.044 75.306 24.033l2.403-.801c5.322-1.565 9.292-4.48 11.683-8.068l.334.056l16.022-28.84c3.204-5.608 2.404-12.016-1.602-18.425a36 36 0 0 0-7.059-6.643l15.872-5.375l14.42-24.033S92.817 4.19 61.831 4.744z"></path></svg>
                ),
                href: "/docs/integrations/solid-start",
            },
            {
                title: "React",
                icon: () => (
                    <svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 15 15"><path fill="currentColor" fillRule="evenodd" d="M5.315 1.837c-.4-.116-.695-.085-.91.032c-.216.116-.404.347-.526.745c-.122.401-.163.936-.104 1.582q.015.157.037.321a14 14 0 0 1 1.676-.311a13 13 0 0 1 1.275-1.54l-.066-.053c-.508-.402-.98-.66-1.382-.776m2.185.14q-.09-.076-.182-.148C6.746 1.377 6.16 1.04 5.594.876C5.024.711 4.441.711 3.928.99s-.833.767-1.005 1.334c-.172.564-.21 1.238-.144 1.965q.023.255.065.523q-.256.09-.49.192c-.671.287-1.246.642-1.66 1.062C.278 6.487 0 7 0 7.584S.278 8.68.694 9.103c.414.42.989.774 1.66 1.062q.235.1.49.192a9 9 0 0 0-.065.523c-.066.726-.028 1.4.144 1.965c.172.567.492 1.056 1.005 1.333c.513.278 1.097.279 1.666.114c.566-.165 1.152-.5 1.724-.953l.182-.149q.09.076.182.149c.572.452 1.158.788 1.724.953c.569.165 1.153.164 1.666-.114c.513-.277.833-.766 1.005-1.333c.172-.564.21-1.239.144-1.965a9 9 0 0 0-.065-.523q.255-.09.49-.192c.671-.288 1.246-.643 1.66-1.062c.416-.422.694-.936.694-1.52c0-.582-.278-1.096-.694-1.518c-.414-.42-.989-.775-1.66-1.062a9 9 0 0 0-.49-.192q.04-.268.065-.523c.066-.727.028-1.4-.144-1.965c-.172-.567-.492-1.056-1.005-1.334S9.975.711 9.406.876c-.566.164-1.152.5-1.724.953zm0 1.365q-.338.346-.672.755a17 17 0 0 1 1.344 0a11 11 0 0 0-.672-.755m2.012.864c-.41-.574-.84-1.092-1.275-1.54l.065-.053c.51-.402.98-.66 1.383-.776c.399-.116.695-.085.91.032c.216.116.404.347.525.745c.122.401.164.936.105 1.582q-.015.158-.037.32a14 14 0 0 0-1.676-.31m-.563.944a15.6 15.6 0 0 0-2.898 0A15.6 15.6 0 0 0 4.72 7.584a15.7 15.7 0 0 0 1.33 2.433a15.6 15.6 0 0 0 2.9 0a15.6 15.6 0 0 0 1.33-2.433A15.7 15.7 0 0 0 8.95 5.15m1.824 1.138a17 17 0 0 0-.527-.956q.39.075.752.168q-.094.385-.225.788m0 2.591a17 17 0 0 1-.527.957q.39-.075.752-.169a12 12 0 0 0-.225-.788m1.18.487a14 14 0 0 0-.588-1.782c.246-.61.443-1.209.588-1.782q.154.058.3.12c.596.256 1.047.547 1.341.845c.292.296.406.572.406.817s-.114.52-.406.816c-.294.299-.745.59-1.341.846a8 8 0 0 1-.3.12m-.765 1.285a14 14 0 0 1-1.676.311c-.41.574-.84 1.091-1.275 1.54l.066.052c.508.403.98.66 1.382.777c.399.116.695.085.91-.032s.404-.348.525-.746c.123-.4.164-.936.105-1.582a7 7 0 0 0-.037-.32M7.5 11.826q.338-.346.672-.755a17 17 0 0 1-1.344 0q.334.408.672.755m-2.746-1.99a17 17 0 0 1-.527-.957q-.13.404-.225.788q.361.094.752.169m-.942.815a14 14 0 0 0 1.676.311c.41.574.839 1.091 1.275 1.54l-.066.052c-.508.403-.98.66-1.382.777c-.4.116-.695.085-.911-.032s-.403-.348-.525-.746c-.122-.4-.163-.936-.104-1.582a8 8 0 0 1 .037-.32m-.765-1.285c.145-.574.341-1.172.588-1.782a14 14 0 0 1-.588-1.782q-.155.058-.3.12c-.596.256-1.047.547-1.341.845c-.292.296-.406.572-.406.817s.114.52.406.816c.294.299.745.59 1.341.846q.146.061.3.12m.955-3.865q.094.384.225.787a17 17 0 0 1 .527-.956q-.39.075-.752.169M6 7.584a1.5 1.5 0 1 1 3 0a1.5 1.5 0 0 1-3 0m1.5-.5a.5.5 0 1 0 0 1a.5.5 0 0 0 0-1" clipRule="evenodd"></path></svg>
                ),
                href: "/docs/integrations/react",
            },
        ]
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
                title: "Introduction",
                icon: () => (
                    <svg xmlns="http://www.w3.org/2000/svg" width="1.1em" height="1.1em" viewBox="0 0 14 14"><path fill="currentColor" fillRule="evenodd" d="M12.402 8.976H7.259a2.278 2.278 0 0 0-.193-4.547h-1.68A3.095 3.095 0 0 0 4.609 0h7.793a1.35 1.35 0 0 1 1.348 1.35v6.279c0 .744-.604 1.348-1.348 1.348ZM2.898 4.431a1.848 1.848 0 1 0 0-3.695a1.848 1.848 0 0 0 0 3.695m5.195 2.276c0-.568-.46-1.028-1.027-1.028H2.899a2.65 2.65 0 0 0-2.65 2.65v1.205c0 .532.432.963.964.963h.172l.282 2.61A1 1 0 0 0 2.66 14h.502a1 1 0 0 0 .99-.862l.753-5.404h2.16c.567 0 1.027-.46 1.027-1.027Z" clipRule="evenodd"></path></svg>
                ),
                href: "/docs/plugins/introduction",
            },
            {
                title: "Authentication",
                group: true,
                href: "/docs/plugins/1st-party-plugins",
                icon: LucideAArrowDown
            },
            {
                title: "Passkey",
                href: "/docs/plugins/passkey",
                icon: () => (
                    <svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 24 24"><path fill="currentColor" d="M18 16.663a3.5 3.5 0 0 1-2-3.163a3.5 3.5 0 1 1 4.5 3.355V17l1.146 1.146a.5.5 0 0 1 0 .708L20.5 20l1.161 1.161a.5.5 0 0 1 .015.692l-1.823 1.984a.5.5 0 0 1-.722.015l-.985-.984a.5.5 0 0 1-.146-.354zM20.5 13a1 1 0 1 0-2 0a1 1 0 0 0 2 0M17 17.242v3.69c-1.36.714-3.031 1.07-5 1.07c-3.42 0-5.944-1.073-7.486-3.237a2.75 2.75 0 0 1-.51-1.596v-.92a2.25 2.25 0 0 1 2.249-2.25h8.775A4.5 4.5 0 0 0 17 17.243M12 2.005a5 5 0 1 1 0 10a5 5 0 0 1 0-10"></path></svg>
                ),
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
                title: "Authorization",
                group: true,
                href: "/docs/plugins/1st-party-plugins",
                icon: LucideAArrowDown
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
                icon: LucideAArrowDown
            },
            {
                title: "Bearer",
                icon: Key,
                href: "/docs/plugins/email-verifier",
            },
            {
                title: "Email Checker",
                icon: MailCheck,
                href: "/docs/plugins/email-verifier",
            },

        ],
    },

    // {
    //     title: "Database",
    //     Icon: () => (
    //         <svg
    //             xmlns="http://www.w3.org/2000/svg"
    //             width="1.4em"
    //             height="1.4em"
    //             viewBox="0 0 24 24"
    //         >
    //             <path
    //                 fill="currentColor"
    //                 d="M20 18c0 2.21-3.582 4-8 4s-8-1.79-8-4v-4.026c.502.617 1.215 1.129 2.008 1.525C7.58 16.285 9.7 16.75 12 16.75s4.42-.465 5.992-1.25c.793-.397 1.506-.91 2.008-1.526z"
    //             />
    //             <path
    //                 fill="currentColor"
    //                 d="M12 10.75c2.3 0 4.42-.465 5.992-1.25c.793-.397 1.506-.91 2.008-1.526V12c0 .5-1.786 1.591-2.679 2.158c-1.323.661-3.203 1.092-5.321 1.092s-3.998-.43-5.321-1.092C5.5 13.568 4 12.5 4 12V7.974c.502.617 1.215 1.129 2.008 1.525C7.58 10.285 9.7 10.75 12 10.75"
    //             />
    //             <path
    //                 fill="currentColor"
    //                 d="M17.321 8.158C15.998 8.819 14.118 9.25 12 9.25s-3.998-.43-5.321-1.092c-.515-.202-1.673-.843-2.477-1.879a.81.81 0 0 1-.162-.621c.023-.148.055-.301.096-.396C4.828 3.406 8.086 2 12 2c3.914 0 7.172 1.406 7.864 3.262c.041.095.073.248.096.396a.81.81 0 0 1-.162.621c-.804 1.036-1.962 1.677-2.477 1.879"
    //             />
    //         </svg>
    //     ),
    //     list: [
    //         {
    //             title: "Drizzle",
    //             href: "/docs/adapters/drizzle",
    //             icon: () => (
    //                 <svg
    //                     xmlns="http://www.w3.org/2000/svg"
    //                     width="1.2em"
    //                     height="1.2em"
    //                     viewBox="0 0 24 24"
    //                 >
    //                     <path
    //                         fill="currentColor"
    //                         d="M5.353 11.823a1.036 1.036 0 0 0-.395-1.422a1.063 1.063 0 0 0-1.437.399L.138 16.702a1.035 1.035 0 0 0 .395 1.422a1.063 1.063 0 0 0 1.437-.398zm11.216 0a1.036 1.036 0 0 0-.394-1.422a1.064 1.064 0 0 0-1.438.399l-3.382 5.902a1.036 1.036 0 0 0 .394 1.422c.506.283 1.15.104 1.438-.398zm7.293-4.525a1.036 1.036 0 0 0-.395-1.422a1.06 1.06 0 0 0-1.437.399l-3.383 5.902a1.036 1.036 0 0 0 .395 1.422a1.063 1.063 0 0 0 1.437-.399zm-11.219 0a1.035 1.035 0 0 0-.394-1.422a1.064 1.064 0 0 0-1.438.398l-3.382 5.903a1.036 1.036 0 0 0 .394 1.422c.506.282 1.15.104 1.438-.399z"
    //                     />
    //                 </svg>
    //             ),
    //         },
    //         {
    //             title: "Prisma",
    //             href: "/docs/adapters/prisma",
    //             icon: () => (
    //                 <svg
    //                     xmlns="http://www.w3.org/2000/svg"
    //                     width="1.2em"
    //                     height="1.2em"
    //                     viewBox="0 0 24 24"
    //                 >
    //                     <path
    //                         fill="currentColor"
    //                         d="M21.807 18.285L13.553.757a1.32 1.32 0 0 0-1.129-.755a1.31 1.31 0 0 0-1.206.626l-8.952 14.5a1.36 1.36 0 0 0 .016 1.455l4.376 6.778a1.41 1.41 0 0 0 1.58.581l12.703-3.757c.389-.115.707-.39.873-.755s.164-.783-.007-1.145m-1.848.752L9.18 22.224a.452.452 0 0 1-.575-.52l3.85-18.438c.072-.345.549-.4.699-.08l7.129 15.138a.515.515 0 0 1-.325.713"
    //                     />
    //                 </svg>
    //             ),
    //         },
    //     ],
    // },
];
