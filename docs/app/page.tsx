import Hero from "@/components/landing/hero";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function Home() {
    return (
        <div className="min-h-[90vh] flex items-center justify-center">
            <main className="flex flex-col gap-8 row-start-2 items-center justify-center">
                <div className="flex flex-col gap-1">

                    <Hero />



                </div>
            </main>
        </div>
    );
}
