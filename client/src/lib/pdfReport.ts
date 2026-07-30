import type { jsPDF } from 'jspdf'
import { companySettingsApi } from './api'

/**
 * Carga jsPDF junto con la fuente Noto Sans (cubre tildes/ñ, que las fuentes
 * base de jsPDF no traen) — mismo patrón que ya usan TicketsPage/EmpleadosPage/
 * NominaPage, solo que centralizado acá para no repetirlo en cada reporte.
 */
export async function loadJsPdf() {
  const { jsPDF } = await import('jspdf')
  ;(window as unknown as { jspdf: { jsPDF: typeof jsPDF } }).jspdf = { jsPDF }
  await import('./fonts/NotoSans-jsPDF.js')
  return jsPDF
}

/** Formato de página en puntos, usado por todos los reportes de Helpdesk. */
export const PAGE = {
  portrait:  { marginX: 40, rightX: 555, pageBottom: 780 },
  landscape: { marginX: 40, rightX: 802, pageBottom: 545 },
}

/**
 * Encabezado estándar de reporte: título, subtítulo (rango de fechas u otro
 * contexto) y regla indigo. `startY` permite correr el bloque hacia abajo
 * cuando ya se dibujó el encabezado de empresa (drawCompanyHeader) por
 * encima — se mantiene opcional para no tocar los call sites existentes.
 */
export function drawReportHeader(pdf: jsPDF, title: string, subtitle: string, rightX: number, startY = 40): number {
  pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(16); pdf.setTextColor(15, 23, 42)
  pdf.text(title, 40, startY)
  pdf.setFont('NotoSans', 'normal'); pdf.setFontSize(9); pdf.setTextColor(100, 116, 139)
  pdf.text(subtitle, 40, startY + 16)
  pdf.setDrawColor(79, 70, 229); pdf.setLineWidth(1.5)
  pdf.line(40, startY + 26, rightX, startY + 26)
  pdf.setLineWidth(0.75)
  return startY + 50
}

/** Datos de empresa ya listos para incrustar en un PDF (logo convertido a dataURL). */
export interface CompanyHeaderData {
  legalName: string
  logoDataUrl?: string | null
  /** Dimensiones naturales del logo (px) — necesarias para incrustarlo sin deformarlo. */
  logoWidth?: number
  logoHeight?: number
  taxId?: string | null
  phone?: string | null
  email?: string | null
}

/**
 * Trae la configuración de empresa y, si tiene logo, lo convierte a dataURL
 * (vía canvas) para poder incrustarlo con `pdf.addImage`. Nunca lanza — si
 * falla cualquier paso (sin conexión, sin logo, sin datos cargados aún), el
 * PDF simplemente se genera sin encabezado de empresa.
 */
export async function loadCompanyHeaderData(): Promise<CompanyHeaderData | null> {
  try {
    const res = await companySettingsApi.get()
    if (!res.ok) return null
    const company = await res.json()

    let logoDataUrl: string | null = null
    let logoWidth: number | undefined
    let logoHeight: number | undefined
    if (company.hasLogo && company.showLogoOnDocuments) {
      try {
        const logoRes = await companySettingsApi.logo()
        if (logoRes.ok) {
          const bitmap = await createImageBitmap(await logoRes.blob())
          const canvas = document.createElement('canvas')
          canvas.width = bitmap.width
          canvas.height = bitmap.height
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(bitmap, 0, 0)
            logoDataUrl = canvas.toDataURL('image/jpeg', 0.9)
            logoWidth = bitmap.width
            logoHeight = bitmap.height
          }
        }
      } catch { /* el logo es opcional en el encabezado — se omite si falla */ }
    }

    return {
      legalName: company.legalName || company.tradeName || '',
      logoDataUrl,
      logoWidth,
      logoHeight,
      taxId: company.taxId,
      phone: company.phone,
      email: company.email,
    }
  } catch {
    return null
  }
}

/**
 * Dibuja el encabezado de empresa (logo + razón social + línea de contacto)
 * al tope del documento. Retorna el Y donde puede empezar el contenido
 * siguiente, o 0 si no hay nada que dibujar (sin datos de empresa cargados
 * o sin razón social) — el llamador debe usar su startY por defecto en ese caso.
 */
export function drawCompanyHeader(pdf: jsPDF, company: CompanyHeaderData | null, marginX: number, rightX: number): number {
  if (!company || !company.legalName) return 0

  // Caja máxima del logo (32 alto × 56 ancho) — se ajusta manteniendo su
  // proporción real para no deformarlo (antes se forzaba a un cuadrado fijo).
  // Se deja arriba de la regla (logoTop + maxLogoHeight < ruleY) para que no
  // quede pegado a la línea divisoria.
  const logoTop = 10
  const maxLogoHeight = 32
  const maxLogoWidth = 56
  let logoW = 0, logoH = 0
  if (company.logoDataUrl && company.logoWidth && company.logoHeight) {
    const ratio = company.logoWidth / company.logoHeight
    logoH = maxLogoHeight
    logoW = logoH * ratio
    if (logoW > maxLogoWidth) { logoW = maxLogoWidth; logoH = logoW / ratio }
  }
  // El logo va en la esquina derecha; la razón social y el contacto quedan a la izquierda.
  if (company.logoDataUrl && logoW && logoH) {
    try { pdf.addImage(company.logoDataUrl, 'JPEG', rightX - logoW, logoTop + (maxLogoHeight - logoH) / 2, logoW, logoH) }
    catch { /* dataURL inválida — se omite el logo, el resto del encabezado sigue */ }
  }

  pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(11); pdf.setTextColor(15, 23, 42)
  pdf.text(company.legalName, marginX, 24)

  const contactLine = [company.taxId, company.phone, company.email].filter(Boolean).join('  ·  ')
  if (contactLine) {
    pdf.setFont('NotoSans', 'normal'); pdf.setFontSize(8); pdf.setTextColor(100, 116, 139)
    pdf.text(contactLine, marginX, 36)
  }

  const ruleY = 48
  pdf.setDrawColor(226, 232, 240); pdf.line(marginX, ruleY, rightX, ruleY)
  return ruleY + 26
}

/** Definición de columna en puntos absolutos, ya resuelta por layoutColumns. */
interface ReportColumn {
  label: string
  x: number
  width: number
  align?: 'left' | 'right'
}

/** Reparte el ancho disponible entre columnas según pesos relativos, sin tener que calcular puntos a mano por reporte. */
export function layoutColumns(
  marginX: number,
  rightX: number,
  defs: { label: string; weight: number; align?: 'left' | 'right' }[],
): ReportColumn[] {
  const totalWeight = defs.reduce((s, d) => s + d.weight, 0)
  const totalWidth = rightX - marginX
  let x = marginX
  return defs.map(d => {
    const width = (d.weight / totalWeight) * totalWidth
    const col: ReportColumn = { label: d.label, width, align: d.align ?? 'left', x: d.align === 'right' ? x + width : x }
    x += width
    return col
  })
}

/**
 * Dibuja una tabla con encabezado repetido en cada página nueva (salta de
 * página automáticamente si la próxima fila no entra) — mismo patrón que
 * NominaPage.tsx (helper "salto"), generalizado para columnas arbitrarias.
 */
export function drawReportTable(pdf: jsPDF, opts: {
  columns: ReportColumn[]
  rows: string[][]
  startY: number
  marginX: number
  rightX: number
  pageBottom: number
}): number {
  let y = opts.startY

  const drawHeaderRow = () => {
    pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(8); pdf.setTextColor(148, 163, 184)
    opts.columns.forEach(c => pdf.text(c.label.toUpperCase(), c.x, y, { align: c.align ?? 'left' }))
    y += 6
    pdf.setDrawColor(226, 232, 240); pdf.line(opts.marginX, y, opts.rightX, y)
  }

  drawHeaderRow()

  if (opts.rows.length === 0) {
    y += 16
    pdf.setFont('NotoSans', 'normal'); pdf.setFontSize(9); pdf.setTextColor(148, 163, 184)
    pdf.text('Sin registros para mostrar.', opts.marginX, y)
    return y
  }

  for (const row of opts.rows) {
    if (y + 16 > opts.pageBottom) {
      pdf.addPage()
      y = 46
      drawHeaderRow()
    }
    y += 14
    pdf.setFont('NotoSans', 'normal'); pdf.setFontSize(9); pdf.setTextColor(15, 23, 42)
    row.forEach((val, i) => {
      const c = opts.columns[i]
      const text = pdf.splitTextToSize(val || '—', Math.max(c.width - 4, 10))[0]
      pdf.text(text, c.x, y, { align: c.align ?? 'left' })
    })
    y += 6
    pdf.setDrawColor(241, 245, 249); pdf.line(opts.marginX, y, opts.rightX, y)
  }

  return y
}

/** Pie estándar: fecha de generación, al final del documento. */
export function drawGeneratedFooter(pdf: jsPDF, y: number, marginX: number) {
  pdf.setFont('NotoSans', 'normal'); pdf.setFontSize(8); pdf.setTextColor(148, 163, 184)
  pdf.text(
    `Generado el ${new Date().toLocaleString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
    marginX, y + 20,
  )
}
