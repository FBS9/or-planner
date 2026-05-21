import React from 'react'

const cn = (...classes) => classes.filter(Boolean).join(' ')

export function Button({ variant = 'default', className = '', disabled, ...props }) {
  const variants = {
    default: 'bg-slate-900 text-white hover:bg-slate-800',
    secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200',
    outline: 'bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50',
  }
  return (
    <button
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant] || variants.default,
        className,
      )}
      {...props}
    />
  )
}
