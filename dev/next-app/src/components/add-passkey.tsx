"use client"
import { useState } from 'react'
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Fingerprint } from 'lucide-react'
import { authClient } from '@/lib/auth-client'

export default function AddPasskey() {
    const [isOpen, setIsOpen] = useState(false)
    const [passkeyName, setPasskeyName] = useState('')

    const handleAddPasskey = async () => {
        // This is where you would implement the actual passkey addition logic
        const res = await authClient.passkey.register()
        setIsOpen(false)
        setPasskeyName('')
    }
    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>

                <Button variant="outline">
                    <Fingerprint className="mr-2 h-4 w-4" />
                    Add Passkey
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Add New Passkey</DialogTitle>
                    <DialogDescription>
                        Create a new passkey to securely access your account without a password.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="passkey-name" className="text-right">
                            Name
                        </Label>
                        <Input
                            id="passkey-name"
                            value={passkeyName}
                            onChange={(e) => setPasskeyName(e.target.value)}
                            className="col-span-3"
                            placeholder="My Passkey"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="submit" onClick={handleAddPasskey} className="w-full">
                        <Fingerprint className="mr-2 h-4 w-4" />
                        Create Passkey
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}