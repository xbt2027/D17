import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-8 w-full min-w-0 border border-input bg-transparent px-2.5 py-1 font-mono text-[16px] text-ink transition-colors outline-none md:text-[12px]',
        'placeholder:uppercase placeholder:text-quiet selection:bg-ink selection:text-paper',
        'file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm',
        'focus-visible:border-dim focus-visible:outline-none',
        'aria-invalid:border-alert',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
