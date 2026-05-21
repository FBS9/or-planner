import React from 'react'

const cn = (...classes) => classes.filter(Boolean).join(' ')

export function Card({ className = '', ...props }) {
  return <div className={cn('bg-white border border-slate-200', className)} {...props} />
}

export function CardContent({ className = '', ...props }) {
  return <div className={className} {...props} />
}
