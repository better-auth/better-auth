import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertCircle, LogIn, LogOut, XCircle } from "lucide-react"

type ErrorType = "wrong-user" | "sign-in-required" | "invalid-invitation"

interface InvitationErrorCardProps {
    errorType: ErrorType
    onSignIn?: () => void
    onLogout?: () => void
}

export function InvitationError({ errorType, onSignIn = () => { }, onLogout = () => { } }: InvitationErrorCardProps) {
    const isWrongUser = errorType === "wrong-user"
    const isSignInRequired = errorType === "sign-in-required"
    const isInvalidInvitation = errorType === "invalid-invitation"

    return (
        <Card className="w-full max-w-md mx-auto">
            <CardHeader>
                <div className="flex items-center space-x-2">
                    {isInvalidInvitation ? (
                        <XCircle className="w-6 h-6 text-destructive" />
                    ) : (
                        <AlertCircle className="w-6 h-6 text-destructive" />
                    )}
                    <CardTitle className="text-xl text-destructive">Invitation Error</CardTitle>
                </div>
                <CardDescription>
                    {isWrongUser && "This invitation is not intended for you."}
                    {isSignInRequired && "You need to sign in to accept this invitation."}
                    {isInvalidInvitation && "This invitation has expired or is invalid."}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <p className="mb-4 text-sm text-muted-foreground">
                    {isWrongUser &&
                        "The email address associated with this invitation doesn't match your account. Please check if you're using the correct email or contact the person who sent the invitation."}
                    {isSignInRequired &&
                        "To accept this invitation, please sign in with your account or create a new one if you haven't already."}
                    {isInvalidInvitation &&
                        "The invitation you're trying to access has either expired or is no longer valid. Please contact the person who sent the invitation for a new one."}
                </p>
            </CardContent>
            <CardFooter className="flex flex-col space-y-2">
                {isSignInRequired && (
                    <Button onClick={onSignIn} className="w-full">
                        <LogIn className="w-4 h-4 mr-2" />
                        Sign In
                    </Button>
                )}
                {isWrongUser && (
                    <Button onClick={onLogout} variant="outline" className="w-full">
                        <LogOut className="w-4 h-4 mr-2" />
                        Logout
                    </Button>
                )}
                {isInvalidInvitation && (
                    <Button onClick={() => window.location.href = '/'} variant="outline" className="w-full">
                        Return to Home
                    </Button>
                )}
            </CardFooter>
        </Card>
    )
}