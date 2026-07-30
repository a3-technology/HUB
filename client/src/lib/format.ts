/** Monto redondeado (sin decimales) con "$" fijo antepuesto (ej. $125 000). '—' si no hay valor. */
export function fmtMoneyRounded(n?: number): string {
  return n != null ? `$${n.toLocaleString('es-CR', { maximumFractionDigits: 0 })}` : '—'
}

/** Monto con separador de miles en inglés y 2 decimales fijos, sin símbolo (ej. 2,745.50) — el llamador antepone símbolo/código si corresponde. */
export function fmtMoneyPlain(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Monto con símbolo de moneda antepuesto y 2 decimales (ej. $2 745,50). */
export function fmtMoneyWithSymbol(n: number, symbol: string): string {
  return `${symbol}${n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
