import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap border font-mono text-[11px] uppercase tracking-[0.02em] transition-colors disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3.5 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-dim aria-invalid:border-alert",
  {
    variants: {
      variant: {
        /* The one filled element in the system: inverted ink. Disabled, it
           demotes to a quiet outline instead of a bright dead button. */
        default:
          'border-ink bg-ink text-paper hover:opacity-80 disabled:border-hairline disabled:bg-transparent disabled:text-quiet',
        destructive:
          'border-alert bg-transparent text-alert hover:bg-alert/10 disabled:border-hairline disabled:text-quiet',
        outline:
          'border-hairline bg-transparent text-dim hover:border-dim hover:text-ink focus-visible:text-ink disabled:text-quiet disabled:hover:border-hairline disabled:hover:text-quiet',
        secondary:
          'border-hairline bg-transparent text-dim hover:border-dim hover:text-ink focus-visible:text-ink disabled:text-quiet disabled:hover:border-hairline disabled:hover:text-quiet',
        ghost:
          'border-transparent bg-transparent text-quiet hover:text-ink disabled:opacity-60',
        link: 'border-transparent text-ink underline decoration-dotted underline-offset-2 hover:text-quiet',
      },
      size: {
        /* max-xl: fixed heights relax to 44px touch minimums on mobile;
           desktop (xl+) keeps the exact compact chrome. */
        default: 'h-8 px-3 py-1 max-xl:h-auto max-xl:min-h-11',
        sm: 'h-7 gap-1.5 px-2.5 max-xl:h-auto max-xl:min-h-11',
        lg: 'h-10 px-5 max-xl:h-auto max-xl:min-h-11',
        icon: 'size-8 max-xl:size-11',
        'icon-sm': 'size-7 max-xl:size-11',
        'icon-lg': 'size-10 max-xl:size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
