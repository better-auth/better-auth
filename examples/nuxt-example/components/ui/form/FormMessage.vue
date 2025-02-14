<script lang="ts" setup>
import { useFormField } from "./useFormField";

const { name, formMessageId } = useFormField();
</script>

<template>
  <ErrorMessage
    :id="formMessageId"
    as="p"
    :name="toValue(name)"
    class="text-[0.8rem] font-medium text-destructive"
  />
</template>
