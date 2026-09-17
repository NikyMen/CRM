'use client'

/**
 * Importe con separador de miles al escribir (1.500.000). La coma es el separador
 * decimal. `value` y `onChange` usan el formato crudo que espera la API ("1500000.5").
 */
export function MoneyInput({ value, onChange, decimals = false, className = 'ctrl-input', ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & { value: string; onChange: (value: string) => void; decimals?: boolean }) {
  const [integer = '', fraction] = value.split('.')
  const display = `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${fraction !== undefined ? `,${fraction}` : ''}`

  const handleChange = (text: string) => {
    const [rawInteger = '', ...rest] = text.split(',')
    const nextInteger = rawInteger.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
    if (!decimals || !rest.length) return onChange(nextInteger)
    onChange(`${nextInteger || '0'}.${rest.join('').replace(/\D/g, '').slice(0, 2)}`)
  }

  return <input {...props} type="text" inputMode={decimals ? 'decimal' : 'numeric'} autoComplete="off" className={className} value={display} onChange={(event) => handleChange(event.target.value)} />
}
