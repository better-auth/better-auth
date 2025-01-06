<script setup lang="ts">
import { useSession } from "~/lib/auth-client";
const { data: session } = await useSession(useFetch);
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
                        <AvatarImage :src="session?.user.image || ''" alt="User profile" />
                        <AvatarFallback>{{ session?.user.name[0] }}</AvatarFallback>
                    </Avatar>
                    <div>
                        <p class="text-sm">
                            {{ session?.user?.name }}
                        </p>
                        <p class="text-xs">
                            {{ session?.user?.email }}
                        </p>
                    </div>
                </div>
            </CardContent>
            <CardFooter>
                <Button @click="async () => {
                    await signOut()
                    // router.push('/')
                }" variant="secondary">
                    Sing Out
                </Button>
            </CardFooter>
        </Card>
    </div>
</template>