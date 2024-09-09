import { AnimatePresence } from "@/components/ui/fade-in"
import { Logs } from "./_logs"
import { FormattedDate } from "./_components/fmt-dates"
const ChangelogPage = () => {
    return (
        <div>
            <div className='mt-10 h-full flex flex-col gap-10'>
                {Logs.map((log) => {
                    return (
                        <div className="relative my-5 h-auto">
                            <div className="sticky top-2 flex-1 h-full">

                                <FormattedDate className="absolute -left-32 text-sm top-0 font-light" date={log.date} />
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
