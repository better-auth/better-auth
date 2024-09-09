import { AnimatePresence } from "@/components/ui/fade-in"
import { Logs } from "./_logs"
import { FormattedDate } from "./_components/fmt-dates"
const ChangelogPage = () => {
    return (
        <div>
            <div className='mt-10 overflow-visible h-full flex flex-col gap-10'>
                {Logs.map((log) => {
                    return (
                        <div className="relative my-5 h-auto">
                            <div className="md:sticky top-2 flex-1 h-full">

                                <FormattedDate className="absolute md:-left-32 left-0 text-sm -top-8 md:top-0 font-light" date={log.date} />
                            </div>
                            <log.component />

                        </div>
                    )
                })}
            </div>

        </div>
    )
}
export default ChangelogPage
