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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { UserPlus } from "lucide-react"
import { authClient } from '@/lib/auth-client'
import { toast } from 'sonner'

export default function InviteDialog() {
    const [email, setEmail] = useState('')
    const [role, setRole] = useState('')

    const handleInvite = async () => {
        // Handle invite logic here
        console.log('Inviting:', email, 'with role:', role)
        await authClient.organization.inviteMember({
            email,
            role: role as 'member' | 'admin' | 'owner',
        })
        // Reset form and close dialog
        setEmail('')
        setRole('')
        toast.success('Successfully invited user to organization')
        setOpenDialog(false)
    }

    const [openDialog, setOpenDialog] = useState(false)

    return (
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
            <DialogTrigger asChild >
                <Button variant="secondary" size="sm" className='gap-2 flex items-center'>
                    <UserPlus className="h-4 w-4" />
                    <p>
                        Invite
                    </p>
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Invite to Organization</DialogTitle>
                    <DialogDescription>
                        Invite a new member to your organization. They'll receive an email with instructions.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="email" className="text-right">
                            Email
                        </Label>
                        <Input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="col-span-3"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="role" className="text-right">
                            Role
                        </Label>
                        <Select value={role} onValueChange={setRole}>
                            <SelectTrigger className="col-span-3">
                                <SelectValue placeholder="Select a role" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="member">Member</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="owner">Owner</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button type="submit" onClick={handleInvite}>Invite</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}