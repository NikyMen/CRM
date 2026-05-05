'use client'

import clsx from 'clsx'

export const DEFAULT_AVATARS = [
  { value: 'preset:emerald', name: 'Verde', classes: 'from-emerald-500 to-teal-700' },
  { value: 'preset:blue', name: 'Azul', classes: 'from-sky-500 to-blue-700' },
  { value: 'preset:amber', name: 'Ambar', classes: 'from-amber-400 to-orange-700' },
  { value: 'preset:rose', name: 'Rosa', classes: 'from-rose-500 to-fuchsia-700' },
  { value: 'preset:slate', name: 'Grafito', classes: 'from-slate-500 to-slate-800' },
] as const

const SIZE_CLASSES = {
  sm: 'h-9 w-9 text-xs rounded-lg',
  md: 'h-11 w-11 text-sm rounded-xl',
  lg: 'h-16 w-16 text-lg rounded-2xl',
  xl: 'h-24 w-24 text-2xl rounded-3xl',
} as const

type AvatarSize = keyof typeof SIZE_CLASSES

export function getInitials(firstName?: string | null, lastName?: string | null, email?: string | null) {
  const first = firstName?.trim()[0]
  const last = lastName?.trim()[0]
  if (first || last) return `${first ?? ''}${last ?? ''}`.toUpperCase()
  return email?.trim()[0]?.toUpperCase() ?? 'U'
}

export function getAvatarPreset(value?: string | null) {
  return DEFAULT_AVATARS.find((avatar) => avatar.value === value) ?? DEFAULT_AVATARS[0]
}

export function isImageAvatar(value?: string | null) {
  return !!value && !value.startsWith('preset:')
}

export function UserAvatar({
  avatar,
  firstName,
  lastName,
  email,
  size = 'md',
  className,
}: {
  avatar?: string | null
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  size?: AvatarSize
  className?: string
}) {
  const initials = getInitials(firstName, lastName, email)

  if (isImageAvatar(avatar)) {
    return (
      <img
        src={avatar ?? undefined}
        alt=""
        className={clsx('shrink-0 border border-white/40 object-cover shadow-sm', SIZE_CLASSES[size], className)}
      />
    )
  }

  const preset = getAvatarPreset(avatar)

  return (
    <div
      className={clsx(
        'flex shrink-0 items-center justify-center bg-gradient-to-br font-extrabold text-white shadow-sm',
        preset.classes,
        SIZE_CLASSES[size],
        className
      )}
    >
      {initials}
    </div>
  )
}
