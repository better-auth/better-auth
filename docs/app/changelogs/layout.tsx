import { Layout } from './_components/_layout'
import { useId } from 'react'

import { Intro, IntroFooter } from './_components/changelog-layout'
import { StarField } from './_components/stat-field'

function Timeline() {
    let id = useId()

    return (
        <div className='pointer-events-none absolute inset-0 z-50 overflow-hidden lg:right-[calc(max(2rem,50%-38rem)+40rem)] lg:min-w-[32rem] lg:overflow-visible'>
            <svg className='absolute left-[max(0px,calc(50%-18.125rem))] top-0 h-full w-1.5 lg:left-full lg:ml-1 xl:left-auto xl:right-1 xl:ml-0' aria-hidden='true'>
                <defs>
                    <pattern id={id} width='6' height='8' patternUnits='userSpaceOnUse'>
                        <path d='M0 0H6M0 8H6' className='stroke-sky-900/10 xl:stroke-white/10 dark:stroke-white/10' fill='none' />
                    </pattern>
                </defs>
                <rect width='100%' height='100%' fill={`url(#${id})`} />
            </svg>
        </div>
    )
}

function Glow() {
    let id = useId()

    return (
        <div className='absolute  inset-0 -z-10 overflow-hidden bg-gradient-to-tr from-transparent via-stone-800/5 to-transparent/10  lg:right-[calc(max(2rem,50%-38rem)+40rem)] lg:min-w-[32rem]'>
            <svg className='absolute -bottom-48 left-[-40%] h-[80rem] w-[180%] lg:-right-40 lg:bottom-auto lg:left-auto lg:top-[-40%] lg:h-[180%] lg:w-[80rem]' aria-hidden='true'>
                <defs>
                    <radialGradient id={`${id}-desktop`} cx='100%'>
                        <stop offset='0%' stopColor='rgba(214, 211, 209, 0.4)' />
                        <stop offset='53.95%' stopColor='rgba(214, 200, 209, 0.09)' />
                        <stop offset='100%' stopColor='rgba(10, 14, 23, 0)' />
                    </radialGradient>
                    <radialGradient id={`${id}-mobile`} cy='100%'>
                        <stop offset='0%' stopColor='rgba(56, 189, 248, 0.3)' />
                        <stop offset='53.95%' stopColor='rgba(0, 71, 255, 0.09)' />
                        <stop offset='100%' stopColor='rgba(10, 14, 23, 0)' />
                    </radialGradient>
                </defs>
                <rect width='100%' height='100%' fill={`url(#${id}-desktop)`} className='hidden lg:block' />
                <rect width='100%' height='100%' fill={`url(#${id}-mobile)`} className='lg:hidden' />
            </svg>
            <div className='absolute inset-x-0 bottom-0 right-0 h-px bg-white/5 mix-blend-overlay lg:left-auto lg:top-0 lg:h-auto lg:w-px' />
        </div>
    )
}

function FixedSidebar({ main, footer }: { main: React.ReactNode; footer: React.ReactNode }) {
    return (
        <div className='relative  flex-none overflow-hidden px-10 lg:pointer-events-none md:fixed lg:inset-0 lg:z-40 lg:flex lg:px-0'>
            <Glow />
            <div className='relative flex w-full lg:pointer-events-auto lg:mr-[calc(max(2rem,50%-35rem)+40rem)] lg:min-w-[32rem] lg:overflow-y-auto lg:overflow-x-hidden lg:pl-[max(4rem,calc(50%-44rem))]'>
                <div className='mx-auto pr-20 max-w-lg lg:mx-auto  lg:flex  lg:max-w-4xl  lg:flex-col lg:before:flex-1 lg:before:pt-6'>
                    <div className='pb-16  pt-20 sm:pb-20 sm:pt-32 lg:py-20'>
                        <div className='relative '>
                            <StarField className='-right-44 top-14' />
                            {main}
                        </div>
                    </div>
                    <div className='flex flex-1 items-end justify-center pb-4 lg:justify-start lg:pb-6'>{footer}</div>
                </div>
            </div>
        </div>
    )
}

const ChangeLogLayout = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className='h-full font-sans overflow-y-auto'>

            <FixedSidebar main={<Intro />} footer={<IntroFooter />} />
            <div />
            <div className='relative overflow-y-auto  flex gap-2 justify-start items-start'>
                <Timeline />

                <div className='space-y-20 py-20 w-[80%] mx-auto md:mx-0 md:ml-auto md:w-1/2 h-screen sm:space-y-20 sm:py-20'>{children}</div>
            </div>
        </div>
    )
}

export default ChangeLogLayout
