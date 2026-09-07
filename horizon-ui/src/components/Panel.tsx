import type { ReactNode } from 'react'
import { cn } from 'cn'

interface Props {
  label: string
  live?: boolean
  className?: string
  right?: ReactNode
  children: ReactNode
}

export function Panel({ label, live, className, right, children }: Props) {
  return (
    <div
      className={cn(
        'rounded-2xl border bg-[var(--surface)] p-4 backdrop-blur-xl',
        'shadow-[0_10px_44px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(218,165,32,0.07)]',
        'transition-colors hover:border-[var(--border-lit)]',
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[8.5px] font-bold uppercase tracking-[0.22em] text-[var(--bronze)]">
          {label}
        </span>
        {right}
        {live && (
          <span
            className="ml-auto h-[5px] w-[5px] rounded-full bg-[var(--amber-hot)]"
            style={{ boxShadow: '0 0 6px var(--amber-hot)', animation: 'pip 1.2s infinite' }}
          />
        )}
      </div>
      {children}
    </div>
  )
}
