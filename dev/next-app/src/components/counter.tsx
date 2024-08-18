import { getCounter } from "@/server/counter"

export async function Counter() {
    const counter = await getCounter()
    return (
        <div className="flex items-center justify-center">
            <div className="text-4xl font-bold">
                {counter.count}
            </div>
        </div>
    )
}