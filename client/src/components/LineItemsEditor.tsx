import { Plus, Trash2 } from 'lucide-react'
import { SearchSelect, type SearchSelectOption } from './SearchSelect'

export interface LineItem {
  productId: string
  description: string
  quantity: string
  unitPrice: string
  taxRate: string
}

export interface ProductCatalogEntry {
  id: string
  name: string
  price: number
  taxRate: number
}

export const EMPTY_LINE: LineItem = { productId: '', description: '', quantity: '1', unitPrice: '0', taxRate: '0' }

function n(v: string) {
  const num = Number(v)
  return Number.isNaN(num) ? 0 : num
}

/** Editor de líneas de detalle (producto, cantidad, precio, impuesto) para Cotizaciones y Órdenes de Venta. */
export function LineItemsEditor({
  lines, onChange, productOptions, productCatalog, currencySymbol,
}: {
  lines: LineItem[]
  onChange: (lines: LineItem[]) => void
  productOptions: SearchSelectOption[]
  productCatalog: ProductCatalogEntry[]
  currencySymbol: string
}) {
  const updateLine = (i: number, patch: Partial<LineItem>) =>
    onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))

  const selectProduct = (i: number, productId: string) => {
    const product = productCatalog.find(p => p.id === productId)
    updateLine(i, {
      productId,
      unitPrice: product ? String(product.price) : lines[i].unitPrice,
      taxRate: product ? String(product.taxRate) : lines[i].taxRate,
    })
  }

  const addLine = () => onChange([...lines, { ...EMPTY_LINE }])
  const removeLine = (i: number) => onChange(lines.filter((_, idx) => idx !== i))

  const lineTotal = (l: LineItem) => n(l.quantity) * n(l.unitPrice)
  const subtotal = lines.reduce((sum, l) => sum + lineTotal(l), 0)
  const taxTotal = lines.reduce((sum, l) => sum + lineTotal(l) * n(l.taxRate) / 100, 0)

  const inputCls = "w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"

  return (
    <div className="space-y-3">
      <div className="hidden sm:grid grid-cols-[2fr_1fr_5rem_6rem_5rem_2rem] gap-2 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1">
        <span>Producto/Servicio</span><span>Descripción</span><span>Cant.</span><span>Precio</span><span>Imp. %</span><span></span>
      </div>

      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_5rem_6rem_5rem_2rem] gap-2 items-center">
          <div className="col-span-2 sm:col-span-1">
            <SearchSelect options={productOptions} value={l.productId} onChange={v => selectProduct(i, v)} placeholder="Selecciona…" searchPlaceholder="Buscar producto…" />
          </div>
          <input type="text" placeholder="Opcional" value={l.description}
            onChange={e => updateLine(i, { description: e.target.value })} className={`col-span-2 sm:col-span-1 ${inputCls}`} />
          <input type="number" min={0} step="0.01" value={l.quantity}
            onChange={e => updateLine(i, { quantity: e.target.value })} className={inputCls} />
          <input type="number" min={0} step="0.01" value={l.unitPrice}
            onChange={e => updateLine(i, { unitPrice: e.target.value })} className={inputCls} />
          <input type="number" min={0} max={100} step="0.01" value={l.taxRate}
            onChange={e => updateLine(i, { taxRate: e.target.value })} className={inputCls} />
          <button type="button" onClick={() => removeLine(i)} disabled={lines.length === 1}
            title="Quitar línea"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-30 disabled:pointer-events-none transition-colors justify-self-center">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      <button type="button" onClick={addLine}
        className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
        <Plus className="w-3.5 h-3.5" />
        Agregar línea
      </button>

      <div className="flex justify-end">
        <div className="w-full sm:w-64 space-y-1 text-sm">
          <div className="flex justify-between text-slate-500 dark:text-slate-400">
            <span>Subtotal</span><span>{currencySymbol}{subtotal.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between text-slate-500 dark:text-slate-400">
            <span>Impuesto</span><span>{currencySymbol}{taxTotal.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between font-semibold text-slate-800 dark:text-slate-200 pt-1 border-t border-slate-100 dark:border-slate-800">
            <span>Total</span><span>{currencySymbol}{(subtotal + taxTotal).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
