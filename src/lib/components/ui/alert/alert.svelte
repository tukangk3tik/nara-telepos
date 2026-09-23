<script lang="ts" module>
	import { type VariantProps, tv } from "tailwind-variants";

	export const alertVariants = tv({
		base: "grid gap-0.5 rounded-lg border px-2.5 py-2 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4 group/alert relative w-full",
		variants: {
			variant: {
				default: "bg-card text-card-foreground",
				success: "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200",
				destructive: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	});

	export type AlertVariant = VariantProps<typeof alertVariants>["variant"];
</script>

<script lang="ts">
	import { cn, type WithElementRef } from "$lib/utils.js";
	import XIcon from '@lucide/svelte/icons/x';
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		variant = "default",
		onClose,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		variant?: AlertVariant;
		onClose?: () => void;
	} = $props();
	let dismissed = $state(false);
</script>

{#if !dismissed}
<div
	bind:this={ref}
	data-slot="alert"
	role="alert"
	class={cn(alertVariants({ variant }), "pr-10", className)}
	{...restProps}
>
	{@render children?.()}
	<button type="button" aria-label="Close alert" class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-current" onclick={() => { dismissed = true; onClose?.() }}><XIcon class="size-4" /></button>
</div>
{/if}
