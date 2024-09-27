<script setup lang="ts">
import { useSession, signOut } from "~/lib/auth-client";
const session = useSession();
const router = useRouter();
</script>


<template>
    <div class="min-h-[80vh] flex items-center justify-center overflow-hidden no-visible-scrollbar px-6 md:px-0">
        <Card class="w-[350px]">
            <CardHeader>
                <CardTitle>
                    User
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div class="flex gap-2 items-center">
                    <Avatar>
                        <AvatarImage :src="session.data?.user.image || ''" alt="@radix-vue" />
                        <AvatarFallback>CN</AvatarFallback>
                    </Avatar>
                    <div>
                        <p class="text-sm">
                            {{ session.data?.user?.name }}
                        </p>
                        <p class="text-xs">
                            {{ session.data?.user?.email }}
                        </p>
                    </div>
                </div>
            </CardContent>
            <CardFooter>
                <Button @click="async()=>{
                    await signOut()
                    router.push('/')
                }" variant="secondary" >
                    Sing Out
                </Button>
             </CardFooter>
        </Card>
    </div>
</template>