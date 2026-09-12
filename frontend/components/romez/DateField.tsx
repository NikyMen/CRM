'use client'

import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { CalendarDays } from 'lucide-react'

/** Convierte `yyyy-mm-dd` al formato visible `dd/mm/aaaa`. */
export function isoToDisplayDate(iso: string) {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : ''
}

/** Convierte `dd/mm/aaaa` a `yyyy-mm-dd`; devuelve cadena vacía si la fecha no existe. */
export function displayToIsoDate(display: string) {
  const match = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return ''
  const [, day, month, year] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return ''
  return `${year}-${month}-${day}`
}

function mask(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter((part) => part.length)
  return parts.join('/')
}

/** Campo de fecha en día / mes / año, independiente del idioma del navegador. */
export function DateField({ value, onChange, disabled }: { value: string; onChange: (iso: string) => void; disabled?: boolean }) {
  const [text, setText] = useState(() => isoToDisplayDate(value))

  useEffect(() => {
    const display = isoToDisplayDate(value)
    if (display && display !== text) setText(display)
  }, [value, text])

  const invalid = text.length === 10 && !displayToIsoDate(text)

  return (
    <>
      <span className="relative block">
        <CalendarDays size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" />
        <input
          className={clsx('ctrl-input pl-9 font-mono tabular-nums', invalid && 'border-[var(--danger-line)]')}
          inputMode="numeric"
          autoComplete="off"
          placeholder="dd/mm/aaaa"
          disabled={disabled}
          value={text}
          onChange={(event) => {
            const next = mask(event.target.value)
            setText(next)
            onChange(displayToIsoDate(next))
          }}
        />
      </span>
      {invalid ? <p className="mt-1.5 text-[11px] font-semibold text-[var(--danger)]">Esa fecha no existe. Usá el formato dd/mm/aaaa.</p> : null}
    </>
  )
}
