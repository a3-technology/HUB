import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, Pencil, Eye, ToggleLeft, ToggleRight, RefreshCw, Users, Save, List, LayoutGrid, Trash2, Calendar, Building2, X, Banknote, FileText, Camera, Upload, Download, User, Briefcase, ChevronDown, FileSpreadsheet, Printer } from 'lucide-react'
import * as XLSX from 'xlsx'
import { employeesApi, departmentsApi, positionsApi, identificationTypesApi, currenciesApi, documentTypesApi, workModalitiesApi, contractTypesApi, banksApi } from '../../lib/api'
import { fmtMoneyPlain } from '../../lib/format'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Pagination, usePagination, type PageSize } from '../../components/Pagination'
import { SearchSelect } from '../../components/SearchSelect'
import { DatePicker } from '../../components/DatePicker'
import { QuickCreateModal } from '../../components/QuickCreateModal'
import { PhotoCropModal } from '../../components/PhotoCropModal'
import { TabsScroller } from '../../components/TabsScroller'
import { PhoneInput } from '../../components/PhoneInput'
import { ThSortFilter } from '../../components/ThSortFilter'
import { loadCompanyHeaderData, drawCompanyHeader } from '../../lib/pdfReport'
import { useToast } from '../../context/ToastContext'
import { useModalTransition } from '../../hooks/useModalTransition'
import { usePermission } from '../../hooks/usePermission'

interface Employee {
  id: string
  code: string
  firstName: string
  lastName: string
  email: string
  /** Teléfono de contacto; undefined si no se ha registrado. */
  phone?: string
  /** Dirección domiciliar; undefined si no se ha registrado. */
  address?: string
  /** Fecha de nacimiento (ISO); undefined si no se ha registrado. */
  birthDate?: string
  identificationTypeId: string
  identificationTypeName: string
  identificationNumber: string
  salary: number
  currencyId?: string
  currencyCode?: string
  currencySymbol?: string
  positionId: string
  positionName: string
  departmentId: string
  departmentName: string
  /** Modalidad de trabajo (hr.WorkModalities); undefined si no se ha registrado. */
  workModalityId?: string
  workModalityName?: string
  /** Tipo de contrato (hr.ContractTypes); undefined si no se ha registrado. */
  contractTypeId?: string
  contractTypeName?: string
  /** Base salarial del contrato activo (Monthly | Hourly | Service); undefined si no tiene contrato. */
  payUnit?: string
  /** Frecuencia de pago del contrato activo (Monthly | Biweekly | Weekly); undefined si no tiene contrato. */
  payFrequency?: string
  /** Jornada laboral del contrato activo (Day | Night | Mixed); undefined si no se especificó. */
  workShift?: string
  /** Banco de la cuenta de nómina (hr.Banks); undefined si no se ha registrado. */
  bankId?: string
  bankName?: string
  /** Número de cuenta bancaria de nómina; undefined si no se ha registrado. */
  bankAccountNumber?: string
  hireDate: string
  isActive: boolean
  resumeUrl?: string
  /** URL firmada temporal de la foto del empleado; undefined si no tiene. */
  photoUrl?: string
  createdAt: string
  updatedAt?: string
}

interface DepartmentOption {
  id: string
  name: string
}

interface PositionOption {
  id: string
  name: string
}

interface IdentificationTypeOption {
  id: string
  name: string
}

interface CurrencyOption {
  id: string
  code: string
  name: string
  symbol: string
}

interface WorkModalityOption {
  id: string
  name: string
}

interface ContractTypeOption {
  id: string
  name: string
}

interface BankOption {
  id: string
  name: string
}

interface EmpForm {
  code: string
  firstName: string
  lastName: string
  email: string
  /** Teléfono de contacto; '' si no se registró (opcional). */
  phone: string
  /** Dirección domiciliar; '' si no se registró (opcional). */
  address: string
  /** Fecha de nacimiento (yyyy-MM-dd); '' si no se registró. */
  birthDate: string
  identificationTypeId: string
  identificationNumber: string
  salary: string
  currencyId: string
  positionId: string
  departmentId: string
  /** Modalidad de trabajo; '' si no se selecciona (opcional). */
  workModalityId: string
  /** Tipo de contrato; '' si no se selecciona (opcional). */
  contractTypeId: string
  /** Base salarial de la remuneración: Monthly | Hourly | Service. */
  payUnit: string
  /** Frecuencia de pago de la nómina: Monthly | Biweekly | Weekly. */
  payFrequency: string
  /** Jornada laboral; '' si no se selecciona (opcional). */
  workShift: string
  /** Banco de la cuenta de nómina; '' si no se selecciona (opcional). */
  bankId: string
  /** Número de cuenta bancaria; '' si no se registró (opcional). */
  bankAccountNumber: string
  hireDate: string
}

const EMPTY_FORM: EmpForm = { code: '', firstName: '', lastName: '', email: '', phone: '', address: '', birthDate: '', identificationTypeId: '', identificationNumber: '', salary: '', currencyId: '', positionId: '', departmentId: '', workModalityId: '', contractTypeId: '', payUnit: 'Monthly', payFrequency: 'Monthly', workShift: '', bankId: '', bankAccountNumber: '', hireDate: '' }

/** Etiquetas del esquema de remuneración del contrato. */
const PAY_UNIT_LABELS: Record<string, string> = { Monthly: 'Mensual', Hourly: 'Por hora', Service: 'Por servicio' }
const PAY_FREQUENCY_LABELS: Record<string, string> = { Monthly: 'Mensual', Biweekly: 'Quincenal', Weekly: 'Semanal' }
const WORK_SHIFT_LABELS: Record<string, string> = { Day: 'Diurna', Night: 'Nocturna', Mixed: 'Mixta' }
const VIEW_MODE_KEY = 'hr_empleados_view_mode'

function loadViewMode(): 'list' | 'card' {
  const stored = localStorage.getItem(VIEW_MODE_KEY)
  return stored === 'card' ? 'card' : 'list'
}

const initials = (firstName: string, lastName: string) =>
  `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()

/** Avatar del empleado: muestra la foto si existe; si no, las iniciales.
 *  Con `square` la foto se muestra cuadrada con esquinas redondeadas (para
 *  las tarjetas); sin él, circular (listas y ficha). */
function EmployeeAvatar({ emp, size, square = false }: {
  emp: Pick<Employee, 'firstName' | 'lastName' | 'photoUrl'>
  size: 'sm' | 'md' | 'lg' | 'xl'
  square?: boolean
}) {
  const sizeCls  = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-xs', lg: 'w-[72px] h-[72px] text-lg', xl: 'w-24 h-24 text-2xl' }[size]
  const shapeCls = square ? 'rounded-xl' : 'rounded-full'
  return emp.photoUrl ? (
    <img
      src={emp.photoUrl}
      alt={`Foto de ${emp.firstName} ${emp.lastName}`}
      className={`${sizeCls} ${shapeCls} object-cover shrink-0 border border-slate-200 dark:border-slate-700`}
    />
  ) : (
    <div className={`${sizeCls} ${shapeCls} bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold shrink-0`}>
      {initials(emp.firstName, emp.lastName)}
    </div>
  )
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** Fecha corta dd/mm/aaaa (p. ej. 17/05/2026), usada en la ficha y sus exportaciones. */
const formatDateShort = (iso: string) =>
  new Date(iso).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** Columnas de la tabla que admiten ordenamiento y filtrado. */
type SortKey = 'code' | 'name' | 'position' | 'department' | 'email' | 'phone' | 'status'

/** Valor textual de un empleado para la columna indicada (base para ordenar y filtrar). */
const colValue = (e: Employee, key: SortKey): string => {
  switch (key) {
    case 'code':       return e.code
    case 'name':       return `${e.firstName} ${e.lastName}`
    case 'position':   return e.positionName
    case 'department': return e.departmentName
    case 'email':      return e.email
    case 'phone':      return e.phone ?? ''
    case 'status':     return e.isActive ? 'Activo' : 'Inactivo'
  }
}

/** Documento del expediente del empleado (hr.EmployeeDocuments). */
interface EmployeeDocument {
  id: string
  employeeId: string
  documentTypeId: string
  documentTypeName: string
  fileName: string
  fileSize?: number
  createdAt: string
}

/** Documento en cola: se sube al guardar cuando el empleado aún no existe. */
interface PendingDocument {
  file: File
  documentTypeId: string
  documentTypeName: string
}

/** Tipo de documento del catálogo hr.DocumentTypes. */
interface DocumentTypeOption {
  id: string
  name: string
  isActive: boolean
}

const DOC_ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.webp']

const formatFileSize = (bytes?: number) => {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function EmpleadosPage() {
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const departmentFilterId = searchParams.get('departmentId')

  const canCreate = usePermission('hr.employees.create')
  const canUpdate = usePermission('hr.employees.update')
  const canToggle = usePermission('hr.employees.toggle')
  const canDelete = usePermission('hr.employees.delete')
  const canPhotoUpload = usePermission('hr.employees.photo-upload')
  const canPhotoDelete = usePermission('hr.employees.photo-delete')
  const canDocUpload = usePermission('hr.employees.document-upload')
  const canDocDelete = usePermission('hr.employees.document-delete')
  const canCreateDept         = usePermission('hr.departments.create')
  const canCreatePosition     = usePermission('hr.positions.create')
  const canCreateIdType       = usePermission('hr.identification-types.create')
  const canCreateWorkModality = usePermission('hr.work-modalities.create')
  const canCreateContractType = usePermission('hr.contract-types.create')
  const canCreateBank         = usePermission('hr.banks.create')
  const canCreateCurrency     = usePermission('general.currencies.create')
  const canCreateDocType      = usePermission('hr.document-types.create')

  const [employees, setEmployees]     = useState<Employee[]>([])
  const [departments, setDepartments] = useState<DepartmentOption[]>([])
  const [positions, setPositions]     = useState<PositionOption[]>([])
  const [idTypes, setIdTypes]         = useState<IdentificationTypeOption[]>([])
  const [currencies, setCurrencies]   = useState<CurrencyOption[]>([])
  const [workModalities, setWorkModalities] = useState<WorkModalityOption[]>([])
  const [contractTypes, setContractTypes]   = useState<ContractTypeOption[]>([])
  const [banks, setBanks]                   = useState<BankOption[]>([])
  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [search, setSearch]           = useState('')
  const [page, setPage]               = useState(1)
  const [pageSize, setPageSize]       = useState<PageSize>(10)
  const [viewMode, setViewModeState]  = useState<'list' | 'card'>(loadViewMode)
  const [sortKey, setSortKey]         = useState<SortKey>('code')
  const [sortDir, setSortDir]         = useState<'asc' | 'desc'>('asc')
  const [columnFilters, setColumnFilters] = useState<Partial<Record<SortKey, string[]>>>({})
  const setViewMode = (mode: 'list' | 'card') => { setViewModeState(mode); localStorage.setItem(VIEW_MODE_KEY, mode) }

  const [modalOpen, setModalOpen]       = useState(false)
  const [editing, setEditing]           = useState<Employee | null>(null)
  const [form, setForm]                 = useState<EmpForm>(EMPTY_FORM)
  const [saving, setSaving]             = useState(false)
  const [toggleTarget, setToggleTarget] = useState<Employee | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null)
  const { mounted: modalMounted, closing: modalClosing } = useModalTransition(modalOpen)

  /** Construye el PDF de la ficha del empleado (jsPDF, importado bajo demanda
   *  para no engordar el bundle inicial). Es el documento único que usan tanto
   *  la descarga como la impresión, para que ambos salgan idénticos. */
  const buildDetailPdf = async () => {
    if (!detailTarget) return null
    const e = detailTarget
    const { jsPDF } = await import('jspdf')
    // Las fuentes base de jsPDF (Helvetica, Times, Courier) solo cubren
    // Latin-1 y no traen signos de moneda como ₡; se registra Noto Sans
    // (que sí lo incluye) antes de crear el documento. El módulo se
    // engancha al jsPDF ya importado vía window.jspdf, tal como espera su
    // envoltorio UMD.
    ;(window as unknown as { jspdf: { jsPDF: typeof jsPDF } }).jspdf = { jsPDF }
    await import('../../lib/fonts/NotoSans-jsPDF.js')
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' })

    const marginX = 40, rightX = 555, colW = 158
    const cols = [40, 218, 396]
    const company = await loadCompanyHeaderData()
    let y = drawCompanyHeader(pdf, company, marginX, rightX) || 46

    // La foto se pide al API (mismo origen; la URL firmada del blob bloquea el
    // fetch por CORS) y se normaliza a JPEG con canvas (jsPDF no admite WEBP).
    let photo: string | null = null
    if (e.photoUrl) {
      try {
        const res = await employeesApi.photo(e.id)
        if (res.ok) {
          const bitmap = await createImageBitmap(await res.blob())
          const canvas = document.createElement('canvas')
          canvas.width = bitmap.width
          canvas.height = bitmap.height
          const ctx = canvas.getContext('2d')!
          ctx.fillStyle = '#ffffff' // fondo para fotos PNG con transparencia
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(bitmap, 0, 0)
          photo = canvas.toDataURL('image/jpeg', 0.9)
        }
      } catch { /* sin foto: la ficha se genera igual */ }
    }

    if (photo) pdf.addImage(photo, 'JPEG', marginX, y - 10, 64, 64)
    const textX = photo ? marginX + 78 : marginX

    pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(16); pdf.setTextColor(15, 23, 42)
    pdf.text(`${e.firstName} ${e.lastName}`, textX, y + 6)
    pdf.setFont('NotoSans', 'normal'); pdf.setFontSize(10); pdf.setTextColor(100, 116, 139)
    pdf.text(`${e.code} · ${e.positionName}`, textX, y + 22)
    pdf.text(`Desde ${formatDateShort(e.hireDate)}`, textX, y + 36)

    if (e.isActive) pdf.setTextColor(5, 150, 105)
    pdf.setFont('NotoSans', 'bold')
    pdf.text(e.isActive ? 'Activo' : 'Inactivo', rightX, y + 6, { align: 'right' })

    y += 62
    pdf.setDrawColor(79, 70, 229); pdf.setLineWidth(1.5)
    pdf.line(marginX, y, rightX, y)
    pdf.setLineWidth(0.75)

    const section = (title: string) => {
      y += 26
      pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(11); pdf.setTextColor(79, 70, 229)
      pdf.text(title, marginX, y)
      y += 6
      pdf.setDrawColor(226, 232, 240)
      pdf.line(marginX, y, rightX, y)
      y += 18
    }

    // Con ancho=true el campo ocupa toda la fila (texto justificado), útil
    // para valores largos como la dirección domiciliar.
    const fields = (items: [string, string | undefined][], ancho = false) => {
      const porFila = ancho ? 1 : 3
      const anchoCol = ancho ? rightX - marginX : colW
      for (let i = 0; i < items.length; i += porFila) {
        let maxLines = 1
        items.slice(i, i + porFila).forEach(([label, value], j) => {
          const x = cols[j]
          pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(7); pdf.setTextColor(148, 163, 184)
          pdf.text(label.toUpperCase(), x, y)
          pdf.setFont('NotoSans', 'normal'); pdf.setFontSize(10); pdf.setTextColor(15, 23, 42)
          const lines: string[] = pdf.splitTextToSize(value || '—', anchoCol)
          if (ancho && lines.length > 1) pdf.text(value || '—', x, y + 12, { align: 'justify', maxWidth: anchoCol })
          else pdf.text(lines, x, y + 12)
          maxLines = Math.max(maxLines, lines.length)
        })
        y += 12 + maxLines * 12 + 10
      }
      y -= 10
    }

    const fecha = (iso?: string) => iso ? formatDateShort(iso) : undefined
    const salario = `${(e.currencySymbol || e.currencyCode) ? `${e.currencySymbol || e.currencyCode} ` : ''}${fmtMoneyPlain(e.salary)}`

    section('Datos personales')
    fields([
      ['Correo', e.email],
      ['Teléfono', e.phone],
      ['Fecha de nacimiento', fecha(e.birthDate)],
      ['Tipo de identificación', e.identificationTypeName],
      ['N° de identificación', e.identificationNumber],
    ])
    y += 22
    fields([['Dirección domiciliar', e.address]], true)

    section('Datos laborales')
    fields([
      ['Código', e.code],
      ['Cargo', e.positionName],
      ['Departamento', e.departmentName],
      ['Fecha de ingreso', fecha(e.hireDate)],
      ['Modalidad de trabajo', e.workModalityName],
      ['Tipo de contrato', e.contractTypeName],
    ])

    section('Remuneración y datos bancarios')
    fields([
      ['Salario', salario],
      ['Moneda', e.currencyCode],
      ['Banco', e.bankName],
      ['N° de cuenta bancaria', e.bankAccountNumber],
    ])

    section('Expediente')
    if (detailDocs.length === 0) {
      pdf.setFont('NotoSans', 'normal'); pdf.setFontSize(10); pdf.setTextColor(148, 163, 184)
      pdf.text('Sin documentos en el expediente.', marginX, y + 4)
      y += 16
    } else {
      pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(7); pdf.setTextColor(148, 163, 184)
      pdf.text('DOCUMENTO', marginX, y); pdf.text('TIPO', 320, y); pdf.text('SUBIDO EL', 470, y)
      y += 6
      pdf.setDrawColor(226, 232, 240); pdf.line(marginX, y, rightX, y)
      for (const d of detailDocs) {
        if (y > 780) { pdf.addPage(); y = 46 }
        y += 15
        pdf.setFont('NotoSans', 'normal'); pdf.setFontSize(9); pdf.setTextColor(15, 23, 42)
        pdf.text(pdf.splitTextToSize(d.fileName, 265)[0], marginX, y)
        pdf.text(pdf.splitTextToSize(d.documentTypeName, 135)[0], 320, y)
        pdf.text(formatDateShort(d.createdAt), 470, y)
        y += 5
        pdf.line(marginX, y, rightX, y)
      }
    }

    pdf.setFont('NotoSans', 'normal'); pdf.setFontSize(8); pdf.setTextColor(148, 163, 184)
    pdf.text(`Ficha generada el ${new Date().toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' })}`, marginX, Math.min(y + 30, 812))

    return pdf
  }

  const downloadDetailPdf = async () => {
    if (!detailTarget) return
    const pdf = await buildDetailPdf()
    pdf?.save(`ficha_${detailTarget.code}.pdf`)
  }

  /** Imprime exactamente el mismo PDF de la descarga: se carga en un iframe
   *  oculto y su visor abre el diálogo de impresión (autoPrint). */
  const printDetail = async () => {
    if (!detailTarget) return
    const pdf = await buildDetailPdf()
    if (!pdf) return

    pdf.autoPrint()
    const url = URL.createObjectURL(pdf.output('blob'))
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.src = url
    // No hay evento fiable de "diálogo cerrado" con PDFs: se limpia con margen.
    setTimeout(() => { iframe.remove(); URL.revokeObjectURL(url) }, 60_000)
    document.body.appendChild(iframe)
  }

  // Menú desplegable del botón Exportar (Excel / CSV)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!exportMenuRef.current?.contains(e.target as Node)) setExportMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Ficha del empleado (solo lectura), con los documentos de su expediente
  const [detailTarget, setDetailTarget] = useState<Employee | null>(null)
  const [detailDocs, setDetailDocs]     = useState<EmployeeDocument[]>([])
  const { mounted: detailMounted, closing: detailClosing } = useModalTransition(!!detailTarget)

  useEffect(() => {
    if (!detailTarget) { setDetailDocs([]); return }
    employeesApi.documents(detailTarget.id)
      .then(res => res.ok ? res.json() : [])
      .then(setDetailDocs)
      .catch(() => setDetailDocs([]))
  }, [detailTarget])

  // Foto en el formulario de crear/editar: se elige con vista previa y se sube
  // al guardar (en creación, usando el Id que retorna el SP de inserción).
  const formPhotoInputRef = useRef<HTMLInputElement>(null)
  const [formPhotoFile, setFormPhotoFile]       = useState<File | null>(null)
  const [formPhotoPreview, setFormPhotoPreview] = useState<string | null>(null)
  const [formRemovePhoto, setFormRemovePhoto]   = useState(false)

  const clearFormPhoto = () => {
    if (formPhotoPreview) URL.revokeObjectURL(formPhotoPreview)
    setFormPhotoFile(null)
    setFormPhotoPreview(null)
  }

  const resetFormPhoto = () => { clearFormPhoto(); setFormRemovePhoto(false) }

  // Imagen pendiente de recorte: al elegir un archivo se abre el modal de
  // recorte cuadrado y solo el resultado recortado queda como foto del form.
  const [cropSrc, setCropSrc] = useState<string | null>(null)

  const handleFormPhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permite volver a elegir el mismo archivo
    if (!file) return

    if (file.size > 5 * 1024 * 1024) { toast.error('La foto no puede superar 5 MB.'); return }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Formato no válido. Se aceptan JPG, PNG y WEBP.'); return
    }

    setCropSrc(URL.createObjectURL(file))
  }

  const handlePhotoCropped = (file: File) => {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
    if (formPhotoPreview) URL.revokeObjectURL(formPhotoPreview)
    setFormPhotoFile(file)
    setFormPhotoPreview(URL.createObjectURL(file))
    setFormRemovePhoto(false)
  }

  const handleCropCancel = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
  }

  // Quitar: si hay archivo recién elegido lo descarta (vuelve a la foto actual);
  // si no, marca la foto existente para eliminarse al guardar.
  const handleFormPhotoRemove = () => {
    if (formPhotoFile) { clearFormPhoto(); return }
    setFormRemovePhoto(true)
  }

  // ── Expediente documental (tab Documentos del formulario) ──────────────────
  // Al editar, los documentos se suben/eliminan de inmediato.
  // Al crear, se acumulan en cola y se suben después de guardar el empleado.
  const docInputRef = useRef<HTMLInputElement>(null)
  const [formTab, setFormTab]           = useState<'personales' | 'laborales' | 'documentos'>('personales')
  const [docTypes, setDocTypes]         = useState<DocumentTypeOption[]>([])
  const [docType, setDocType]           = useState<string>('') // Id del tipo seleccionado (hr.DocumentTypes)
  const [formDocs, setFormDocs]         = useState<EmployeeDocument[]>([])
  const [pendingDocs, setPendingDocs]   = useState<PendingDocument[]>([])
  const [docUploading, setDocUploading] = useState(false)
  const [deleteDocTarget, setDeleteDocTarget] = useState<EmployeeDocument | null>(null)

  // Creación rápida de tipo de documento desde el propio select del expediente.
  const [docTypeModalOpen, setDocTypeModalOpen] = useState(false)
  const [docTypeForm, setDocTypeForm]           = useState({ name: '' })
  const [docTypeSaving, setDocTypeSaving]       = useState(false)
  const [docTypeError, setDocTypeError]         = useState<string | null>(null)
  const { mounted: docTypeModalMounted, closing: docTypeModalClosing } = useModalTransition(docTypeModalOpen)

  const openDocTypeModal  = (query: string) => { setDocTypeForm({ name: query }); setDocTypeError(null); setDocTypeModalOpen(true) }
  const closeDocTypeModal = () => setDocTypeModalOpen(false)

  const loadDocTypes = async () => {
    const res = await documentTypesApi.list()
    if (res.ok) setDocTypes(await res.json())
  }

  const handleSaveDocType = async () => {
    if (!docTypeForm.name.trim()) { setDocTypeError('El nombre es requerido.'); return }
    setDocTypeSaving(true); setDocTypeError(null)
    try {
      const res = await documentTypesApi.create({ name: docTypeForm.name.trim() })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al crear el tipo de documento.' }))
        setDocTypeError(err.message); toast.error(err.message); return
      }
      const result = await res.json()
      toast.success('Tipo de documento creado correctamente.')
      await loadDocTypes()
      setDocType(result.id)
      closeDocTypeModal()
    } finally { setDocTypeSaving(false) }
  }

  const loadFormDocs = async (employeeId: string) => {
    const res = await employeesApi.documents(employeeId)
    setFormDocs(res.ok ? await res.json() : [])
  }

  const validateDocFile = (file: File): string | null => {
    if (file.size > 10 * 1024 * 1024) return 'El documento no puede superar 10 MB.'
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    if (!DOC_ALLOWED_EXTENSIONS.includes(ext)) return 'Formato no válido. Se aceptan PDF, DOC, DOCX, JPG, PNG y WEBP.'
    return null
  }

  const handleDocSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permite volver a elegir el mismo archivo
    if (!file) return

    if (!docType) { toast.error('Selecciona el tipo de documento.'); return }
    const error = validateDocFile(file)
    if (error) { toast.error(error); return }

    if (!editing) {
      const typeName = docTypes.find(t => t.id === docType)?.name ?? ''
      setPendingDocs(prev => [...prev, { file, documentTypeId: docType, documentTypeName: typeName }])
      return
    }

    setDocUploading(true)
    try {
      const res = await employeesApi.uploadDocument(editing.id, file, docType)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'No se pudo subir el documento.' }))
        toast.error(err.message); return
      }
      toast.success('Documento subido correctamente.')
      await loadFormDocs(editing.id)
    } finally { setDocUploading(false) }
  }

  // Descarga un documento del expediente: la URL firmada fuerza la descarga
  // (Content-Disposition: attachment) con el nombre original del archivo.
  const downloadDocument = async (employeeId: string, docId: string) => {
    try {
      const res = await employeesApi.documentUrl(employeeId, docId)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'No se pudo descargar el documento.' }))
        toast.error(err.message); return
      }
      const { url } = await res.json()
      const link = document.createElement('a')
      link.href = url
      link.rel = 'noopener'
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch {
      toast.error('No se pudo descargar el documento.')
    }
  }

  const handleDeleteDoc = async () => {
    if (!deleteDocTarget) return
    try {
      const res = await employeesApi.deleteDocument(deleteDocTarget.employeeId, deleteDocTarget.id)
      if (res.ok) {
        toast.success('Documento eliminado correctamente.')
        await loadFormDocs(deleteDocTarget.employeeId)
      } else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar el documento.' }))
        toast.error(err.message)
      }
    } finally { setDeleteDocTarget(null) }
  }

  const removePendingDoc = (index: number) =>
    setPendingDocs(prev => prev.filter((_, i) => i !== index))

  // Abre el CV asociado al empleado (el del candidato de origen) con URL firmada.
  // La pestaña se abre ANTES del await para que el bloqueador de popups no la cancele.
  const openEmployeeResume = async (employeeId: string) => {
    const win = window.open('', '_blank')
    try {
      const res = await employeesApi.resumeUrl(employeeId)
      if (!res.ok) {
        win?.close()
        const err = await res.json().catch(() => ({ message: 'No se pudo abrir el currículum.' }))
        toast.error(err.message); return
      }
      const { url } = await res.json()
      if (win) win.location.href = url
      else window.open(url, '_blank', 'noopener')
    } catch {
      win?.close()
      toast.error('No se pudo abrir el currículum.')
    }
  }

  // Creación rápida de departamento desde el propio modal de empleado.
  const [deptModalOpen, setDeptModalOpen] = useState(false)
  const [deptForm, setDeptForm]           = useState({ name: '', description: '' })
  const [deptSaving, setDeptSaving]       = useState(false)
  const [deptError, setDeptError]         = useState<string | null>(null)
  const { mounted: deptModalMounted, closing: deptModalClosing } = useModalTransition(deptModalOpen)

  // Creación rápida de cargo desde el propio modal de empleado.
  const [posModalOpen, setPosModalOpen] = useState(false)
  const [posForm, setPosForm]           = useState({ name: '', description: '' })
  const [posSaving, setPosSaving]       = useState(false)
  const [posError, setPosError]         = useState<string | null>(null)
  const { mounted: posModalMounted, closing: posModalClosing } = useModalTransition(posModalOpen)

  // Creación rápida de tipo de identificación desde el propio modal de empleado.
  const [idtModalOpen, setIdtModalOpen] = useState(false)
  const [idtForm, setIdtForm]           = useState({ name: '' })
  const [idtSaving, setIdtSaving]       = useState(false)
  const [idtError, setIdtError]         = useState<string | null>(null)
  const { mounted: idtModalMounted, closing: idtModalClosing } = useModalTransition(idtModalOpen)

  // Creación rápida de catálogos simples (modalidad, tipo de contrato, banco)
  // desde el propio modal de empleado, con un único modal genérico. El catálogo
  // se conserva al cerrar para que el título no se vacíe durante la animación.
  const [quickOpen, setQuickOpen]       = useState(false)
  const [quickCatalog, setQuickCatalog] = useState<'modality' | 'contractType' | 'bank'>('modality')
  const [quickQuery, setQuickQuery]     = useState('')

  // Creación rápida de moneda desde el propio modal de empleado.
  const [curModalOpen, setCurModalOpen] = useState(false)
  const [curForm, setCurForm]           = useState({ code: '', name: '', symbol: '' })
  const [curSaving, setCurSaving]       = useState(false)
  const [curError, setCurError]         = useState<string | null>(null)
  const { mounted: curModalMounted, closing: curModalClosing } = useModalTransition(curModalOpen)

  const load = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const res = await employeesApi.list(departmentFilterId ?? undefined)
      if (res.ok) setEmployees(await res.json())
    } finally {
      silent ? setRefreshing(false) : setLoading(false)
    }
  }

  const loadDepartments = async () => {
    const res = await departmentsApi.list()
    if (res.ok) setDepartments(await res.json())
  }

  const loadPositions = async () => {
    const res = await positionsApi.list()
    if (res.ok) setPositions(await res.json())
  }

  const loadIdTypes = async () => {
    const res = await identificationTypesApi.list()
    if (res.ok) setIdTypes(await res.json())
  }

  const loadCurrencies = async () => {
    const res = await currenciesApi.list()
    if (res.ok) setCurrencies(await res.json())
  }

  const loadWorkModalities = async () => {
    const res = await workModalitiesApi.list(true)
    if (res.ok) setWorkModalities(await res.json())
  }

  const loadContractTypes = async () => {
    const res = await contractTypesApi.list(true)
    if (res.ok) setContractTypes(await res.json())
  }

  const loadBanks = async () => {
    const res = await banksApi.list(true)
    if (res.ok) setBanks(await res.json())
  }

  useEffect(() => { load(); setPage(1) }, [departmentFilterId])
  useEffect(() => { loadDepartments(); loadPositions(); loadIdTypes(); loadCurrencies(); loadDocTypes(); loadWorkModalities(); loadContractTypes(); loadBanks() }, [])

  const filterDepartment = departments.find(d => d.id === departmentFilterId)
  const clearDepartmentFilter = () => setSearchParams(prev => { prev.delete('departmentId'); return prev })

  const handleSearch = (value: string) => { setSearch(value); setPage(1) }

  // Clic en una cabecera: alterna asc/desc si ya está activa, o la activa en ascendente
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }

  const setColumnFilter = (key: SortKey, values: string[]) => {
    setColumnFilters(prev => ({ ...prev, [key]: values }))
    setPage(1)
  }

  /** Valores únicos de una columna (sobre todos los empleados) para el popover de filtro. */
  const filterOptions = (key: SortKey) =>
    Array.from(new Set(employees.map(e => colValue(e, key)))).sort((a, b) => a.localeCompare(b, 'es'))

  const filtered = employees
    .filter(e => {
      const q = search.toLowerCase()
      return (
        e.code.toLowerCase().includes(q) ||
        e.firstName.toLowerCase().includes(q) ||
        e.lastName.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.positionName.toLowerCase().includes(q) ||
        e.identificationNumber.toLowerCase().includes(q) ||
        e.departmentName.toLowerCase().includes(q)
      )
    })
    .filter(e =>
      (Object.entries(columnFilters) as [SortKey, string[]][])
        .every(([key, values]) => values.length === 0 || values.includes(colValue(e, key)))
    )
    .sort((a, b) => {
      const cmp = colValue(a, sortKey).localeCompare(colValue(b, sortKey), 'es', { numeric: true, sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
  const paginated = usePagination(filtered, page, pageSize)

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    resetFormPhoto()
    setFormTab('personales'); setDocType(''); setFormDocs([]); setPendingDocs([])
    setModalOpen(true)
  }
  const openEdit = (e: Employee) => {
    setEditing(e)
    setForm({
      code: e.code, firstName: e.firstName, lastName: e.lastName, email: e.email,
      phone: e.phone ?? '',
      address: e.address ?? '',
      birthDate: e.birthDate ? e.birthDate.slice(0, 10) : '',
      identificationTypeId: e.identificationTypeId,
      identificationNumber: e.identificationNumber, salary: String(e.salary),
      currencyId: e.currencyId ?? '',
      positionId: e.positionId, departmentId: e.departmentId,
      workModalityId: e.workModalityId ?? '',
      contractTypeId: e.contractTypeId ?? '',
      payUnit: e.payUnit ?? 'Monthly',
      payFrequency: e.payFrequency ?? 'Monthly',
      workShift: e.workShift ?? '',
      bankId: e.bankId ?? '',
      bankAccountNumber: e.bankAccountNumber ?? '',
      hireDate: e.hireDate.slice(0, 10),
    })
    resetFormPhoto()
    setFormTab('personales'); setDocType(''); setFormDocs([]); setPendingDocs([])
    loadFormDocs(e.id)
    setModalOpen(true)
  }
  const closeModal = () => { setModalOpen(false); setEditing(null); resetFormPhoto() }

  const openDeptModal  = (query: string) => { setDeptForm({ name: query, description: '' }); setDeptError(null); setDeptModalOpen(true) }
  const closeDeptModal = () => setDeptModalOpen(false)

  const openPosModal  = (query: string) => { setPosForm({ name: query, description: '' }); setPosError(null); setPosModalOpen(true) }
  const closePosModal = () => setPosModalOpen(false)

  const openIdtModal  = (query: string) => { setIdtForm({ name: query }); setIdtError(null); setIdtModalOpen(true) }
  const closeIdtModal = () => setIdtModalOpen(false)

  /** Título y placeholder del modal genérico según el catálogo activo. */
  const QUICK_CATALOGS = {
    modality:     { title: 'Nueva Modalidad de Trabajo', placeholder: 'Ej: Presencial, Remoto, Híbrido' },
    contractType: { title: 'Nuevo Tipo de Contrato',     placeholder: 'Ej: Indefinido, Temporal' },
    bank:         { title: 'Nuevo Banco',                placeholder: 'Ej: Banreservas' },
  } as const

  const openQuickModal = (catalog: keyof typeof QUICK_CATALOGS) => (query: string) => {
    setQuickQuery(query); setQuickCatalog(catalog); setQuickOpen(true)
  }

  /** Crea el registro del catálogo activo, refresca su lista y lo deja
   *  seleccionado en el formulario de empleado. */
  const handleQuickSave = async (name: string): Promise<string | null> => {
    if (quickCatalog === 'modality') {
      const res = await workModalitiesApi.create({ name })
      if (!res.ok) return (await res.json().catch(() => null))?.message ?? 'Error al crear la modalidad.'
      const { id } = await res.json()
      toast.success('Modalidad creada correctamente.')
      await loadWorkModalities()
      setForm(f => ({ ...f, workModalityId: id }))
    } else if (quickCatalog === 'contractType') {
      const res = await contractTypesApi.create({ name })
      if (!res.ok) return (await res.json().catch(() => null))?.message ?? 'Error al crear el tipo de contrato.'
      const { id } = await res.json()
      toast.success('Tipo de contrato creado correctamente.')
      await loadContractTypes()
      setForm(f => ({ ...f, contractTypeId: id }))
    } else if (quickCatalog === 'bank') {
      const res = await banksApi.create({ name })
      if (!res.ok) return (await res.json().catch(() => null))?.message ?? 'Error al crear el banco.'
      const { id } = await res.json()
      toast.success('Banco creado correctamente.')
      await loadBanks()
      setForm(f => ({ ...f, bankId: id }))
    }
    return null
  }

  const handleSaveIdt = async () => {
    if (!idtForm.name.trim()) { setIdtError('El nombre es requerido.'); return }
    setIdtSaving(true); setIdtError(null)
    try {
      const res = await identificationTypesApi.create({ name: idtForm.name.trim() })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al crear el tipo de identificación.' }))
        setIdtError(err.message); toast.error(err.message); return
      }
      const result = await res.json()
      toast.success('Tipo de identificación creado correctamente.')
      await loadIdTypes()
      setForm(f => ({ ...f, identificationTypeId: result.id }))
      closeIdtModal()
    } finally { setIdtSaving(false) }
  }

  const handleSavePos = async () => {
    if (!posForm.name.trim()) { setPosError('El nombre es requerido.'); return }
    setPosSaving(true); setPosError(null)
    try {
      const payload = { name: posForm.name.trim(), description: posForm.description.trim() || undefined }
      const res = await positionsApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al crear el cargo.' }))
        setPosError(err.message); toast.error(err.message); return
      }
      const result = await res.json()
      toast.success('Cargo creado correctamente.')
      await loadPositions()
      setForm(f => ({ ...f, positionId: result.id }))
      closePosModal()
    } finally { setPosSaving(false) }
  }

  const handleSaveDept = async () => {
    if (!deptForm.name.trim()) { setDeptError('El nombre es requerido.'); return }
    setDeptSaving(true); setDeptError(null)
    try {
      const payload = { name: deptForm.name.trim(), description: deptForm.description.trim() || undefined }
      const res = await departmentsApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al crear el departamento.' }))
        setDeptError(err.message); toast.error(err.message); return
      }
      const result = await res.json()
      toast.success('Departamento creado correctamente.')
      await loadDepartments()
      setForm(f => ({ ...f, departmentId: result.id }))
      closeDeptModal()
    } finally { setDeptSaving(false) }
  }

  const openCurModal = (query: string) => {
    setCurForm({ code: query.toUpperCase().slice(0, 3), name: '', symbol: '' })
    setCurError(null)
    setCurModalOpen(true)
  }
  const closeCurModal = () => setCurModalOpen(false)

  const handleSaveCur = async () => {
    if (!curForm.code.trim() || !curForm.name.trim() || !curForm.symbol.trim()) {
      setCurError('Código, nombre y símbolo son requeridos.'); return
    }
    if (curForm.code.trim().length !== 3) {
      setCurError('El código debe tener 3 letras (ISO 4217).'); return
    }
    setCurSaving(true); setCurError(null)
    try {
      const payload = { code: curForm.code.trim().toUpperCase(), name: curForm.name.trim(), symbol: curForm.symbol.trim() }
      const res = await currenciesApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al crear la moneda.' }))
        setCurError(err.message); toast.error(err.message); return
      }
      const result = await res.json()
      toast.success('Moneda creada correctamente.')
      await loadCurrencies()
      setForm(f => ({ ...f, currencyId: result.id }))
      closeCurModal()
    } finally { setCurSaving(false) }
  }

  const handleSave = async () => {
    if (!form.code.trim() || !form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || !form.identificationTypeId || !form.identificationNumber.trim() || !form.currencyId || !form.positionId || !form.departmentId || !form.hireDate) {
      // Se enfoca el tab donde está el primer campo requerido faltante
      if (!form.firstName.trim() || !form.lastName.trim() || !form.identificationTypeId || !form.identificationNumber.trim() || !form.email.trim()) setFormTab('personales')
      else setFormTab('laborales')
      toast.error('Completa todos los campos requeridos.'); return
    }
    const salary = form.salary.trim() === '' ? 0 : Number(form.salary)
    if (Number.isNaN(salary) || salary < 0) {
      setFormTab('laborales'); toast.error('La remuneración debe ser un número mayor o igual a cero.'); return
    }
    setSaving(true)
    try {
      const payload = {
        code: form.code.trim(), firstName: form.firstName.trim(), lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        birthDate: form.birthDate || null,
        identificationTypeId: form.identificationTypeId, identificationNumber: form.identificationNumber.trim(),
        salary, currencyId: form.currencyId, positionId: form.positionId,
        departmentId: form.departmentId,
        workModalityId: form.workModalityId || null,
        contractTypeId: form.contractTypeId || null,
        payUnit: form.payUnit,
        payFrequency: form.payFrequency,
        workShift: form.workShift || null,
        bankId: form.bankId || null,
        bankAccountNumber: form.bankAccountNumber.trim() || null,
        hireDate: form.hireDate,
      }
      const res = editing
        ? await employeesApi.update(editing.id, payload)
        : await employeesApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar.' }))
        toast.error(err.message); return
      }

      // Foto: se sube (o se quita) después de guardar, usando el Id del empleado
      const result = await res.json().catch(() => null)
      const employeeId = editing?.id ?? result?.id
      if (employeeId) {
        if (formPhotoFile) {
          const photoRes = await employeesApi.uploadPhoto(employeeId, formPhotoFile)
          if (!photoRes.ok) {
            const err = await photoRes.json().catch(() => ({ message: 'No se pudo subir la foto.' }))
            toast.error(`El empleado se guardó, pero la foto no: ${err.message}`)
          }
        } else if (formRemovePhoto && editing?.photoUrl) {
          const delRes = await employeesApi.deletePhoto(employeeId)
          if (!delRes.ok) toast.error('El empleado se guardó, pero no se pudo quitar la foto.')
        }

        // Documentos en cola (solo en creación): se suben con el Id del nuevo empleado
        for (const doc of pendingDocs) {
          const docRes = await employeesApi.uploadDocument(employeeId, doc.file, doc.documentTypeId)
          if (!docRes.ok) {
            const err = await docRes.json().catch(() => ({ message: 'Error al subir.' }))
            toast.error(`No se pudo subir "${doc.file.name}": ${err.message}`)
          }
        }
      }

      toast.success(editing ? 'Empleado actualizado correctamente.' : 'Empleado creado correctamente.')
      closeModal(); await load()
    } finally { setSaving(false) }
  }

  const handleToggle = async () => {
    if (!toggleTarget) return
    const wasActive = toggleTarget.isActive
    try {
      const res = await employeesApi.toggle(toggleTarget.id)
      if (res.ok) { toast.success(wasActive ? 'Empleado desactivado.' : 'Empleado activado.'); await load() }
      else toast.error('No se pudo cambiar el estado del empleado.')
    } finally { setToggleTarget(null) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await employeesApi.remove(deleteTarget.id)
      if (res.ok) { toast.success('Empleado eliminado correctamente.'); await load() }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar el empleado.' }))
        toast.error(err.message)
      }
    } finally { setDeleteTarget(null) }
  }

  const globalIndex = (i: number) =>
    pageSize === 'all' ? i + 1 : (page - 1) * (pageSize as number) + i + 1

  /** Encabezados y filas con toda la información de los empleados visibles
   *  según los filtros activos, base común de las exportaciones. */
  const buildExportData = () => {
    const fmt = (iso?: string) => iso ? new Date(iso).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
    const headers = [
      'Código', 'Nombre', 'Apellido', 'Correo', 'Teléfono', 'Dirección',
      'Fecha de nacimiento', 'Tipo de identificación', 'N° de identificación',
      'Cargo', 'Departamento', 'Fecha de ingreso', 'Modalidad de trabajo',
      'Tipo de contrato', 'Salario', 'Moneda', 'Banco', 'N° de cuenta bancaria',
      'Estado', 'Registrado el', 'Última actualización',
    ]
    const rows = filtered.map(e => [
      e.code, e.firstName, e.lastName, e.email, e.phone ?? '', e.address ?? '',
      fmt(e.birthDate), e.identificationTypeName, e.identificationNumber,
      e.positionName, e.departmentName, fmt(e.hireDate), e.workModalityName ?? '',
      e.contractTypeName ?? '', e.salary.toFixed(2), e.currencyCode ?? '', e.bankName ?? '',
      e.bankAccountNumber ?? '', e.isActive ? 'Activo' : 'Inactivo',
      fmt(e.createdAt), fmt(e.updatedAt),
    ])
    return { headers, rows }
  }

  const exportFileName = () => `empleados_${new Date().toISOString().slice(0, 10)}`

  /** Exporta a CSV. El BOM UTF-8 hace que Excel muestre bien los acentos y el
   *  ';' respeta el separador de listas de la configuración regional en español. */
  const exportCsv = () => {
    setExportMenuOpen(false)
    if (filtered.length === 0) { toast.error('No hay empleados para exportar.'); return }

    const { headers, rows } = buildExportData()
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
    const csv = [headers, ...rows].map(r => r.map(escape).join(';')).join('\r\n')

    const bom = String.fromCharCode(0xfeff)
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${exportFileName()}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    toast.success(`${filtered.length} empleado(s) exportado(s).`)
  }

  /** Exporta a Excel (.xlsx) con anchos de columna ajustados al contenido. */
  const exportExcel = () => {
    setExportMenuOpen(false)
    if (filtered.length === 0) { toast.error('No hay empleados para exportar.'); return }

    const { headers, rows } = buildExportData()
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    ws['!cols'] = headers.map((h, i) =>
      ({ wch: Math.min(40, Math.max(h.length, ...rows.map(r => r[i].length)) + 2) }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Empleados')
    XLSX.writeFile(wb, `${exportFileName()}.xlsx`)
    toast.success(`${filtered.length} empleado(s) exportado(s).`)
  }

  return (
    <div className="p-6 space-y-4">

      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Empleados</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${employees.length} empleado(s) registrado(s)`}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setExportMenuOpen(v => !v)}
              disabled={loading || filtered.length === 0}
              className="h-9 shrink-0 flex items-center gap-2 px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Exportar
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${exportMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {exportMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 z-30 w-44 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden py-1">
                <button
                  onClick={exportExcel}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  Excel (.xlsx)
                </button>
                <button
                  onClick={exportCsv}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                  CSV (.csv)
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            title="Actualizar"
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          {canCreate && (
            <button
              onClick={openCreate}
              disabled={departments.length === 0}
              title={departments.length === 0 ? 'Primero crea un departamento' : undefined}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              Nuevo Empleado
            </button>
          )}
        </div>
      </div>

      {/* Filtro activo por departamento */}
      {departmentFilterId && (
        <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 text-sm text-indigo-700 dark:text-indigo-400 w-fit">
          <Building2 className="w-4 h-4 shrink-0" />
          <span>
            Filtrando por departamento: <span className="font-semibold">{filterDepartment?.name ?? '…'}</span>
          </span>
          <button
            onClick={clearDepartmentFilter}
            title="Quitar filtro"
            className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Búsqueda + selector de vista */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 min-w-0 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por código, nombre, correo o cargo…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 p-1 shrink-0">
          <button
            onClick={() => setViewMode('list')}
            title="Vista de lista"
            className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
              viewMode === 'list'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('card')}
            title="Vista de tarjetas"
            className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
              viewMode === 'card'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Vista de lista */}
      {viewMode === 'list' && (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">

            {/* Cabecera */}
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider w-12">#</th>
                {([
                  { label: 'Empleado',     colKey: 'name'       as SortKey, align: 'left'   as const },
                  { label: 'Cargo',        colKey: 'position'   as SortKey, align: 'left'   as const },
                  { label: 'Departamento', colKey: 'department' as SortKey, align: 'center' as const },
                  { label: 'Correo',       colKey: 'email'      as SortKey, align: 'left'   as const },
                  { label: 'Teléfono',     colKey: 'phone'      as SortKey, align: 'left'   as const },
                  { label: 'Estado',       colKey: 'status'     as SortKey, align: 'center' as const },
                ]).map(col => (
                  <ThSortFilter
                    key={col.colKey}
                    label={col.label}
                    colKey={col.colKey}
                    align={col.align}
                    activeSortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    options={filterOptions(col.colKey)}
                    selected={columnFilters[col.colKey] ?? []}
                    onFilterChange={setColumnFilter}
                  />
                ))}
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>

            {/* Cuerpo */}
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-slate-700/40">
                    {[8, 48, 40, 32, 48, 16, 20].map((w, j) => (
                      <td key={j} className="px-5 py-2">
                        <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" style={{ width: `${w * 4}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <Users className="w-9 h-9 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      {search ? 'Sin resultados para la búsqueda.' : 'No hay empleados registrados.'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginated.map((emp, i) => (
                  <tr
                    key={emp.id}
                    className="border-b border-slate-50 dark:border-slate-700/40 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors"
                  >
                    {/* # */}
                    <td className="px-5 py-2 text-xs text-slate-400 dark:text-slate-500 font-medium text-center align-middle">
                      {globalIndex(i)}
                    </td>

                    {/* Empleado — avatar + nombre + código */}
                    <td className="px-5 py-2 align-middle">
                      <div className="flex items-center gap-3">
                        <EmployeeAvatar emp={emp} size="md" square />
                        <div className="leading-tight">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">{emp.firstName} {emp.lastName}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{emp.code}</p>
                        </div>
                      </div>
                    </td>

                    {/* Cargo */}
                    <td className="px-5 py-2 text-slate-500 dark:text-slate-400 align-middle whitespace-nowrap">
                      {emp.positionName}
                    </td>

                    {/* Departamento */}
                    <td className="px-5 py-2 text-center align-middle whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                        {emp.departmentName}
                      </span>
                    </td>

                    {/* Correo */}
                    <td className="px-5 py-2 text-slate-500 dark:text-slate-400 align-middle whitespace-nowrap">
                      {emp.email}
                    </td>

                    {/* Teléfono */}
                    <td className="px-5 py-2 text-slate-500 dark:text-slate-400 align-middle whitespace-nowrap">
                      {emp.phone ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>

                    {/* Estado */}
                    <td className="px-5 py-2 text-center align-middle">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                        emp.isActive
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                          : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
                      }`}>
                        {emp.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>

                    {/* Acciones */}
                    <td className="px-5 py-2 align-middle">
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          onClick={() => setDetailTarget(emp)}
                          title="Ver ficha"
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {emp.resumeUrl && (
                          <button
                            onClick={() => openEmployeeResume(emp.id)}
                            title="Descargar CV"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canUpdate && (
                          <button
                            onClick={() => openEdit(emp)}
                            title="Editar"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canToggle && (
                          <button
                            onClick={() => setToggleTarget(emp)}
                            title={emp.isActive ? 'Desactivar' : 'Activar'}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                              emp.isActive
                                ? 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
                                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                            }`}
                          >
                            {emp.isActive
                              ? <ToggleRight className="w-4 h-4" />
                              : <ToggleLeft  className="w-4 h-4" />
                            }
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setDeleteTarget(emp)}
                            title="Eliminar"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {!loading && filtered.length > 0 && (
          <Pagination
            total={filtered.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </div>
      )}

      {/* Vista de tarjetas */}
      {viewMode === 'card' && (
      <div className="space-y-4">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-3">
                <div className="h-4 w-2/3 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" />
                <div className="h-3 w-1/3 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" />
                <div className="h-3 w-full bg-slate-100 dark:bg-slate-700 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-5 py-16 text-center">
            <Users className="w-9 h-9 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400">
              {search ? 'Sin resultados para la búsqueda.' : 'No hay empleados registrados.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(380px,1fr))] gap-4">
            {filtered.map(emp => (
              <div
                key={emp.id}
                className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex gap-3.5"
              >
                <EmployeeAvatar emp={emp} size="xl" square />

                <div className="min-w-0 flex-1 flex flex-col justify-between gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{emp.firstName} {emp.lastName}</p>
                      <p className="text-xs text-slate-400 truncate">{emp.code} · {emp.positionName}</p>
                      <p className="flex items-center gap-1 text-xs text-slate-400">
                        <Calendar className="w-3 h-3 shrink-0" />
                        Desde {formatDate(emp.hireDate)}
                      </p>
                    </div>
                    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                      emp.isActive
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                        : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
                    }`}>
                      {emp.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 truncate">
                      {emp.departmentName}
                    </span>
                    <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => setDetailTarget(emp)}
                      title="Ver ficha"
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    {emp.resumeUrl && (
                      <button
                        onClick={() => openEmployeeResume(emp.id)}
                        title="Descargar CV"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canUpdate && (
                      <button
                        onClick={() => openEdit(emp)}
                        title="Editar"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canToggle && (
                      <button
                        onClick={() => setToggleTarget(emp)}
                        title={emp.isActive ? 'Desactivar' : 'Activar'}
                        className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
                          emp.isActive
                            ? 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
                            : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                        }`}
                      >
                        {emp.isActive
                          ? <ToggleRight className="w-4 h-4" />
                          : <ToggleLeft  className="w-4 h-4" />
                        }
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => setDeleteTarget(emp)}
                        title="Eliminar"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Modal crear / editar */}
      {modalMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${modalClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden ${modalClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            {/* Encabezado fijo: solo el título (tabs y campos se desplazan en el cuerpo) */}
            <div className="px-6 pt-6 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
                {editing ? 'Editar Empleado' : 'Nuevo Empleado'}
              </h2>
            </div>

            {/* Cuerpo con scroll propio: tabs + campos */}
            <div className="flex-1 overflow-y-auto px-6 pb-5 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
            {/* Tabs: Datos personales / Datos laborales / Documentos */}
            <TabsScroller tone="modal" className="mb-5">
              {([
                { key: 'personales', label: 'Datos personales', icon: User },
                { key: 'laborales',  label: 'Datos laborales',  icon: Briefcase },
                { key: 'documentos', label: 'Documentos',       icon: FileText },
              ] as const).map(t => {
                const docCount = editing ? formDocs.length : pendingDocs.length
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setFormTab(t.key)}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                      formTab === t.key
                        ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    <t.icon className="w-4 h-4" />
                    {t.label}
                    {t.key === 'documentos' && docCount > 0 && (
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                        formTab === t.key
                          ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400'
                          : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                      }`}>
                        {docCount}
                      </span>
                    )}
                  </button>
                )
              })}
            </TabsScroller>

            <div className="space-y-4">

              {formTab === 'personales' && (<>
              {/* Fila 1: foto de perfil (se sube a Azure Blob al guardar) + nombre + apellido */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
              <div className="flex items-center justify-center gap-4">
                {/* Avatar clicable: overlay de cámara al pasar el mouse + insignia de edición */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={canPhotoUpload ? () => formPhotoInputRef.current?.click() : undefined}
                    title={canPhotoUpload ? ((formPhotoFile || (editing?.photoUrl && !formRemovePhoto)) ? 'Cambiar foto' : 'Subir foto') : undefined}
                    className={`group relative block rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${canPhotoUpload ? '' : 'cursor-default'}`}
                  >
                    {(() => {
                      const previewSrc = formRemovePhoto ? null : (formPhotoPreview ?? editing?.photoUrl ?? null)
                      return previewSrc ? (
                        <img
                          src={previewSrc}
                          alt="Foto del empleado"
                          className="w-24 h-24 rounded-xl object-cover ring-2 ring-slate-100 dark:ring-slate-700 shadow-sm"
                        />
                      ) : (
                        <div className="w-24 h-24 rounded-xl bg-gradient-to-br from-indigo-50 to-slate-100 dark:from-indigo-500/15 dark:to-slate-800 text-indigo-400 dark:text-indigo-300 flex items-center justify-center ring-2 ring-slate-100 dark:ring-slate-700">
                          {form.firstName.trim() || form.lastName.trim()
                            ? <span className="text-2xl font-bold tracking-wide">{initials(form.firstName.trim(), form.lastName.trim())}</span>
                            : <Camera className="w-7 h-7" />}
                        </div>
                      )
                    })()}
                    {canPhotoUpload && (
                      <span className="absolute inset-0 rounded-xl bg-slate-900/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Camera className="w-6 h-6 text-white" />
                      </span>
                    )}
                  </button>
                  {/* Insignia para quitar la foto; solo aparece cuando hay una cargada y el usuario tiene permiso */}
                  {((formPhotoFile && canPhotoUpload) || (editing?.photoUrl && !formRemovePhoto && canPhotoDelete)) && (
                    <button
                      type="button"
                      onClick={handleFormPhotoRemove}
                      title="Quitar foto"
                      className="absolute -bottom-0.5 -right-0.5 w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center border-[3px] border-white dark:border-slate-900 shadow transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <input
                  ref={formPhotoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleFormPhotoSelected}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre <span className="text-red-500">*</span></label>
                <input type="text" maxLength={100} placeholder="Ej: María" value={form.firstName}
                  onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Apellido <span className="text-red-500">*</span></label>
                <input type="text" maxLength={100} placeholder="Ej: García" value={form.lastName}
                  onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
              </div>
              </div>

              {/* Fila 2: fecha de nacimiento + identificación */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Fecha de nacimiento</label>
                  <DatePicker value={form.birthDate}
                    onChange={birthDate => setForm(f => ({ ...f, birthDate }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Tipo de identificación <span className="text-red-500">*</span></label>
                  <SearchSelect
                    value={form.identificationTypeId}
                    onChange={identificationTypeId => setForm(f => ({ ...f, identificationTypeId }))}
                    options={[...idTypes].sort((a, b) => a.name.localeCompare(b.name)).map(t => ({ value: t.id, label: t.name }))}
                    placeholder="Selecciona un tipo de identificación…"
                    searchPlaceholder="Buscar tipo de identificación…"
                    emptyLabel="No se encontraron tipos de identificación."
                    onCreateNew={canCreateIdType ? openIdtModal : undefined}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">N° de identificación <span className="text-red-500">*</span></label>
                  <input type="text" maxLength={50} placeholder="Ej: 001-1234567-8" value={form.identificationNumber}
                    onChange={e => setForm(f => ({ ...f, identificationNumber: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                </div>
              </div>
              {/* Fila 3: información de contacto */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Correo <span className="text-red-500">*</span></label>
                  <input type="email" maxLength={150} placeholder="nombre@empresa.com" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Teléfono</label>
                  <PhoneInput value={form.phone}
                    onChange={phone => setForm(f => ({ ...f, phone }))} />
                </div>
              </div>
              {/* Fila 4: dirección domiciliar */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Dirección domiciliar</label>
                <textarea rows={3} maxLength={500} placeholder="Ej: Calle Principal #12, Sector Los Prados, Santo Domingo" value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none" />
              </div>
              </>)}

              {formTab === 'laborales' && (<>
              {/* Fila 1: código + cargo + departamento */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Código <span className="text-red-500">*</span></label>
                  <input type="text" maxLength={10} placeholder="Ej: EMP001" value={form.code}
                    onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Cargo <span className="text-red-500">*</span></label>
                  <SearchSelect
                    value={form.positionId}
                    onChange={positionId => setForm(f => ({ ...f, positionId }))}
                    options={[...positions].sort((a, b) => a.name.localeCompare(b.name)).map(p => ({ value: p.id, label: p.name }))}
                    placeholder="Selecciona un cargo…"
                    searchPlaceholder="Buscar cargo…"
                    emptyLabel="No se encontraron cargos."
                    onCreateNew={canCreatePosition ? openPosModal : undefined}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Departamento <span className="text-red-500">*</span></label>
                  <SearchSelect
                    value={form.departmentId}
                    onChange={departmentId => setForm(f => ({ ...f, departmentId }))}
                    options={[...departments].sort((a, b) => a.name.localeCompare(b.name)).map(d => ({ value: d.id, label: d.name }))}
                    placeholder="Selecciona un departamento…"
                    searchPlaceholder="Buscar departamento…"
                    emptyLabel="No se encontraron departamentos."
                    onCreateNew={canCreateDept ? openDeptModal : undefined}
                  />
                </div>
              </div>
              {/* Fila 2: fecha de contratación + modalidad + tipo de contrato */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Fecha de contratación <span className="text-red-500">*</span></label>
                  <DatePicker value={form.hireDate}
                    onChange={hireDate => setForm(f => ({ ...f, hireDate }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Modalidad de trabajo</label>
                  <SearchSelect
                    value={form.workModalityId}
                    onChange={workModalityId => setForm(f => ({ ...f, workModalityId }))}
                    options={[...workModalities].sort((a, b) => a.name.localeCompare(b.name)).map(m => ({ value: m.id, label: m.name }))}
                    placeholder="Selecciona una modalidad…"
                    searchPlaceholder="Buscar modalidad…"
                    emptyLabel="No se encontraron modalidades."
                    onCreateNew={canCreateWorkModality ? openQuickModal('modality') : undefined}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Tipo de contrato</label>
                  <SearchSelect
                    value={form.contractTypeId}
                    onChange={contractTypeId => setForm(f => ({ ...f, contractTypeId }))}
                    options={[...contractTypes].sort((a, b) => a.name.localeCompare(b.name)).map(t => ({ value: t.id, label: t.name }))}
                    placeholder="Selecciona un tipo de contrato…"
                    searchPlaceholder="Buscar tipo de contrato…"
                    emptyLabel="No se encontraron tipos de contrato."
                    onCreateNew={canCreateContractType ? openQuickModal('contractType') : undefined}
                  />
                </div>
              </div>
              {/* Panel: remuneración y datos bancarios de nómina */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30 p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-indigo-500" />
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Remuneración y datos bancarios</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Salario</label>
                    <input type="number" min={0} step="0.01" placeholder="0.00" value={form.salary}
                      onChange={e => setForm(f => ({ ...f, salary: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Moneda <span className="text-red-500">*</span></label>
                    <SearchSelect
                      value={form.currencyId}
                      onChange={currencyId => setForm(f => ({ ...f, currencyId }))}
                      options={currencies.map(c => ({ value: c.id, label: `${c.code} - ${c.name}` }))}
                      placeholder="Selecciona una moneda…"
                      searchPlaceholder="Buscar moneda…"
                      emptyLabel="No se encontraron monedas."
                      onCreateNew={canCreateCurrency ? openCurModal : undefined}
                    />
                  </div>
                </div>
                {/* Esquema de remuneración: define el contrato inicial del empleado */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Base salarial</label>
                    <SearchSelect
                      value={form.payUnit}
                      onChange={payUnit => setForm(f => ({ ...f, payUnit }))}
                      options={Object.entries(PAY_UNIT_LABELS).map(([value, label]) => ({ value, label }))}
                      placeholder="Selecciona…"
                      searchPlaceholder="Buscar…"
                      emptyLabel="—"
                    />
                    <p className="text-xs text-slate-400">Base de cálculo del salario indicado.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Frecuencia de pago</label>
                    <SearchSelect
                      value={form.payFrequency}
                      onChange={payFrequency => setForm(f => ({ ...f, payFrequency }))}
                      options={Object.entries(PAY_FREQUENCY_LABELS).map(([value, label]) => ({ value, label }))}
                      placeholder="Selecciona…"
                      searchPlaceholder="Buscar…"
                      emptyLabel="—"
                    />
                    <p className="text-xs text-slate-400">Cada cuánto se paga la nómina.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Jornada laboral</label>
                    <SearchSelect
                      value={form.workShift}
                      onChange={workShift => setForm(f => ({ ...f, workShift }))}
                      options={[{ value: '', label: 'Sin especificar' }, ...Object.entries(WORK_SHIFT_LABELS).map(([value, label]) => ({ value, label }))]}
                      placeholder="Sin especificar"
                      searchPlaceholder="Buscar…"
                      emptyLabel="—"
                    />
                    <p className="text-xs text-slate-400">Diurna, nocturna o mixta.</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Banco</label>
                    <SearchSelect
                      value={form.bankId}
                      onChange={bankId => setForm(f => ({ ...f, bankId }))}
                      options={[...banks].sort((a, b) => a.name.localeCompare(b.name)).map(b => ({ value: b.id, label: b.name }))}
                      placeholder="Selecciona un banco…"
                      searchPlaceholder="Buscar banco…"
                      emptyLabel="No se encontraron bancos."
                      onCreateNew={canCreateBank ? openQuickModal('bank') : undefined}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">N° de cuenta bancaria</label>
                    <input type="text" maxLength={50} placeholder="Ej: 9600123456" value={form.bankAccountNumber}
                      onChange={e => setForm(f => ({ ...f, bankAccountNumber: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                  </div>
                </div>
              </div>
              </>)}

              {formTab === 'documentos' && (
                <div className="space-y-4">

                  {/* Selector de tipo + botón de subida */}
                  <div className="flex items-end gap-2">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Tipo de documento</label>
                      <SearchSelect
                        value={docType}
                        onChange={setDocType}
                        options={docTypes.filter(t => t.isActive).map(t => ({ value: t.id, label: t.name }))}
                        placeholder="Selecciona un tipo de documento…"
                        searchPlaceholder="Buscar tipo…"
                        emptyLabel="No se encontraron tipos."
                        onCreateNew={canCreateDocType ? openDocTypeModal : undefined}
                      />
                    </div>
                    {canDocUpload && (
                      <button
                        type="button"
                        onClick={() => docInputRef.current?.click()}
                        disabled={docUploading || !docType}
                        title={!docType ? 'Selecciona primero el tipo de documento' : undefined}
                        className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors shrink-0"
                      >
                        {docUploading
                          ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          : <Upload className="w-3.5 h-3.5" />}
                        {docUploading ? 'Subiendo…' : 'Agregar'}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">PDF, DOC, DOCX, JPG, PNG o WEBP · máximo 10 MB</p>
                  {!editing && pendingDocs.length > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Los documentos se subirán al guardar el empleado.
                    </p>
                  )}

                  {/* Lista de documentos: expediente (editar) o cola (crear) */}
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden">
                    {editing ? (
                      formDocs.length === 0 ? (
                        <p className="px-4 py-6 text-sm text-slate-400 text-center">Sin documentos en el expediente.</p>
                      ) : (
                        formDocs.map(doc => (
                          <div key={doc.id} className="flex items-center gap-3 px-4 py-2.5">
                            <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{doc.fileName}</p>
                              <p className="text-xs text-slate-400">
                                {doc.documentTypeName}
                                {doc.fileSize ? ` · ${formatFileSize(doc.fileSize)}` : ''} · {formatDate(doc.createdAt)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => downloadDocument(doc.employeeId, doc.id)}
                              title="Descargar documento"
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors shrink-0"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            {canDocDelete && (
                              <button
                                type="button"
                                onClick={() => setDeleteDocTarget(doc)}
                                title="Eliminar documento"
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))
                      )
                    ) : (
                      pendingDocs.length === 0 ? (
                        <p className="px-4 py-6 text-sm text-slate-400 text-center">Aún no has agregado documentos.</p>
                      ) : (
                        pendingDocs.map((doc, i) => (
                          <div key={`${doc.file.name}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                            <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{doc.file.name}</p>
                              <p className="text-xs text-slate-400">
                                {doc.documentTypeName} · {formatFileSize(doc.file.size)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removePendingDoc(i)}
                              title="Quitar de la lista"
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors shrink-0"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))
                      )
                    )}
                  </div>

                  <input
                    ref={docInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                    className="hidden"
                    onChange={handleDocSelected}
                  />
                </div>
              )}

            </div>
            </div>
            {/* Pie fijo: acciones */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button onClick={closeModal} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {saving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ficha del empleado — solo lectura */}
      {detailMounted && detailTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${detailClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden ${detailClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            {/* Encabezado fijo: avatar, nombre y estado */}
            <div className="shrink-0 flex items-start justify-between gap-3 px-6 pt-6 pb-5">
              <div className="flex items-start gap-3">
                <EmployeeAvatar emp={detailTarget} size="lg" square />
                <div className="leading-tight space-y-1">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {detailTarget.firstName} {detailTarget.lastName}
                  </h2>
                  <p className="text-xs text-slate-400">{detailTarget.code} · {detailTarget.positionName}</p>
                  <p className="flex items-center gap-1 text-xs text-slate-400">
                    <Calendar className="w-3 h-3 shrink-0" />
                    Desde {formatDateShort(detailTarget.hireDate)}
                  </p>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                <span className={`mr-0.5 inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${
                  detailTarget.isActive
                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                }`}>
                  {detailTarget.isActive ? 'Activo' : 'Inactivo'}
                </span>
                <button
                  onClick={downloadDetailPdf}
                  title="Descargar PDF"
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={printDetail}
                  title="Imprimir ficha"
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                >
                  <Printer className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Cuerpo con scroll propio: datos y trayectoria */}
            <div className="flex-1 overflow-y-auto px-6 pb-5 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
            <div className="space-y-4">
              {/* Sección: datos personales */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <User className="w-4 h-4 text-indigo-500" />
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Datos personales</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-sm">
                  <div>
                    <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Correo</p>
                    <p className="text-slate-700 dark:text-slate-200 break-all">{detailTarget.email}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Teléfono</p>
                    <p className="text-slate-700 dark:text-slate-200">{detailTarget.phone ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Fecha de nacimiento</p>
                    <p className="text-slate-700 dark:text-slate-200">{detailTarget.birthDate ? formatDateShort(detailTarget.birthDate) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Tipo de identificación</p>
                    <p className="text-slate-700 dark:text-slate-200">{detailTarget.identificationTypeName}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">N° de identificación</p>
                    <p className="text-slate-700 dark:text-slate-200">{detailTarget.identificationNumber}</p>
                  </div>
                  <div className="col-span-2 sm:col-span-3">
                    <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Dirección domiciliar</p>
                    <p className="text-slate-700 dark:text-slate-200 text-justify">{detailTarget.address ?? '—'}</p>
                  </div>
                </div>
              </div>

              {/* Sección: datos laborales */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Briefcase className="w-4 h-4 text-indigo-500" />
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Datos laborales</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-sm">
                  <div>
                    <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Código</p>
                    <p className="text-slate-700 dark:text-slate-200">{detailTarget.code}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Cargo</p>
                    <p className="text-slate-700 dark:text-slate-200">{detailTarget.positionName}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Departamento</p>
                    <p className="text-slate-700 dark:text-slate-200">{detailTarget.departmentName}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Fecha de ingreso</p>
                    <p className="text-slate-700 dark:text-slate-200">{formatDateShort(detailTarget.hireDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Modalidad de trabajo</p>
                    <p className="text-slate-700 dark:text-slate-200">{detailTarget.workModalityName ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Tipo de contrato</p>
                    <p className="text-slate-700 dark:text-slate-200">{detailTarget.contractTypeName ?? '—'}</p>
                  </div>
                </div>
              </div>

              {/* Sección: remuneración y datos bancarios */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Banknote className="w-4 h-4 text-indigo-500" />
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Remuneración y datos bancarios</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-sm">
                  <div>
                    <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Salario</p>
                    <p className="text-slate-700 dark:text-slate-200">
                      {(detailTarget.currencySymbol || detailTarget.currencyCode) ? `${detailTarget.currencySymbol || detailTarget.currencyCode} ` : ''}{fmtMoneyPlain(detailTarget.salary)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Moneda</p>
                    <p className="text-slate-700 dark:text-slate-200">{detailTarget.currencyCode ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Banco</p>
                    <p className="text-slate-700 dark:text-slate-200">{detailTarget.bankName ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">N° de cuenta bancaria</p>
                    <p className="text-slate-700 dark:text-slate-200">{detailTarget.bankAccountNumber ?? '—'}</p>
                  </div>
                </div>
              </div>

              {/* Sección: documentos del expediente, con descarga */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-indigo-500" />
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Expediente</h3>
                </div>
                <div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden bg-white dark:bg-slate-800/40">
                    {detailDocs.length === 0 ? (
                      <p className="px-4 py-5 text-sm text-slate-400 text-center">Sin documentos en el expediente.</p>
                    ) : (
                      detailDocs.map(doc => (
                        <div key={doc.id} className="flex items-center gap-3 px-4 py-2.5">
                          <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{doc.fileName}</p>
                            <p className="text-xs text-slate-400">
                              {doc.documentTypeName}
                              {doc.fileSize ? ` · ${formatFileSize(doc.fileSize)}` : ''} · {formatDateShort(doc.createdAt)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => downloadDocument(doc.employeeId, doc.id)}
                            title="Descargar documento"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors shrink-0"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
            </div>
            {/* Pie fijo */}
            <div className="shrink-0 flex items-center justify-end px-6 py-4 border-t border-slate-100 dark:border-slate-800">
              <button onClick={() => setDetailTarget(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal crear departamento — acceso rápido desde el select de empleado */}
      {deptModalMounted && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${deptModalClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md p-6 ${deptModalClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-5">
              Nuevo Departamento
            </h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre <span className="text-red-500">*</span></label>
                <input type="text" maxLength={100} placeholder="Ej: Tecnología de la Información" value={deptForm.name}
                  onChange={e => setDeptForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Descripción</label>
                <textarea rows={2} maxLength={500} placeholder="Función o responsabilidades del departamento…" value={deptForm.description}
                  onChange={e => setDeptForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none" />
              </div>
              {deptError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {deptError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={closeDeptModal} disabled={deptSaving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveDept} disabled={deptSaving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {deptSaving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                {deptSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal crear tipo de identificación — acceso rápido desde el select de empleado */}
      {/* Recorte cuadrado de la foto antes de quedar en el formulario */}
      <PhotoCropModal
        open={!!cropSrc}
        imageSrc={cropSrc ?? ''}
        onCancel={handleCropCancel}
        onCropped={handlePhotoCropped}
      />

      {/* Modal genérico de creación rápida (modalidad, tipo de contrato, banco) */}
      <QuickCreateModal
        open={quickOpen}
        title={QUICK_CATALOGS[quickCatalog].title}
        placeholder={QUICK_CATALOGS[quickCatalog].placeholder}
        initialName={quickQuery}
        onClose={() => setQuickOpen(false)}
        onSave={handleQuickSave}
      />

      {idtModalMounted && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${idtModalClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md p-6 ${idtModalClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-5">
              Nuevo Tipo de Identificación
            </h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre <span className="text-red-500">*</span></label>
                <input type="text" maxLength={100} placeholder="Ej: Cédula, Pasaporte" value={idtForm.name}
                  onChange={e => setIdtForm({ name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
              </div>
              {idtError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {idtError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={closeIdtModal} disabled={idtSaving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveIdt} disabled={idtSaving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {idtSaving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                {idtSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal crear tipo de documento — acceso rápido desde el select del expediente */}
      {docTypeModalMounted && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${docTypeModalClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md p-6 ${docTypeModalClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-5">
              Nuevo Tipo de Documento
            </h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre <span className="text-red-500">*</span></label>
                <input type="text" maxLength={100} placeholder="Ej: Licencia de conducir, Certificado médico" value={docTypeForm.name}
                  onChange={e => setDocTypeForm({ name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
              </div>
              {docTypeError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {docTypeError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={closeDocTypeModal} disabled={docTypeSaving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveDocType} disabled={docTypeSaving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {docTypeSaving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                {docTypeSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal crear cargo — acceso rápido desde el select de empleado */}
      {posModalMounted && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${posModalClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md p-6 ${posModalClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-5">
              Nuevo Cargo
            </h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre <span className="text-red-500">*</span></label>
                <input type="text" maxLength={100} placeholder="Ej: Desarrollador Senior" value={posForm.name}
                  onChange={e => setPosForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Descripción</label>
                <textarea rows={2} maxLength={500} placeholder="Funciones o responsabilidades del cargo…" value={posForm.description}
                  onChange={e => setPosForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none" />
              </div>
              {posError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {posError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={closePosModal} disabled={posSaving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSavePos} disabled={posSaving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {posSaving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                {posSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal crear moneda — acceso rápido desde el select de empleado */}
      {curModalMounted && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${curModalClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md p-6 ${curModalClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-5">
              Nueva Moneda
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Código ISO <span className="text-red-500">*</span></label>
                  <input type="text" maxLength={3} placeholder="Ej: DOP" value={curForm.code}
                    onChange={e => setCurForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition uppercase" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Símbolo <span className="text-red-500">*</span></label>
                  <input type="text" maxLength={5} placeholder="Ej: RD$" value={curForm.symbol}
                    onChange={e => setCurForm(f => ({ ...f, symbol: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre <span className="text-red-500">*</span></label>
                <input type="text" maxLength={100} placeholder="Ej: Peso dominicano" value={curForm.name}
                  onChange={e => setCurForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
              </div>
              {curError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {curError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={closeCurModal} disabled={curSaving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveCur} disabled={curSaving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {curSaving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                {curSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!toggleTarget}
        title={toggleTarget?.isActive ? '¿Desactivar empleado?' : '¿Activar empleado?'}
        message={
          toggleTarget?.isActive
            ? `El empleado "${toggleTarget.firstName} ${toggleTarget.lastName}" será desactivado.`
            : `El empleado "${toggleTarget?.firstName} ${toggleTarget?.lastName}" volverá a estar activo.`
        }
        confirmLabel={toggleTarget?.isActive ? 'Sí, desactivar' : 'Sí, activar'}
        cancelLabel="Cancelar"
        onConfirm={handleToggle}
        onCancel={() => setToggleTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar empleado?"
        message={`El empleado "${deleteTarget?.firstName} ${deleteTarget?.lastName}" se eliminará permanentemente. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteDocTarget}
        title="¿Eliminar documento?"
        message={`El documento "${deleteDocTarget?.fileName}" se eliminará del expediente y del almacenamiento. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDeleteDoc}
        onCancel={() => setDeleteDocTarget(null)}
      />

    </div>
  )
}
