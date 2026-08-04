import { tokenStore } from './tokenStore'

const REFRESH_KEY = 'hub_refresh_token'

// URL base del API en producción (App Service). En desarrollo queda vacía y las
// peticiones relativas '/api/...' pasan por el proxy de Vite (vite.config.ts).
const API_BASE_URL = import.meta.env.VITE_API_URL ?? ''

// El backend rota el refresh token en cada uso (revoca el anterior). Si dos
// llamadas concurrentes intentan refrescar con el mismo token, la segunda
// siempre falla porque la primera ya lo revocó. Para evitar esa carrera
// (p. ej. StrictMode montando efectos dos veces, o varias peticiones en
// paralelo detectando un 401 al mismo tiempo), se comparte una única
// petición de refresco en curso entre todos los llamadores.
let refreshInFlight: Promise<boolean> | null = null

// Refresca el access token usando el refresh token almacenado en localStorage.
// Retorna true si el refresco fue exitoso.
async function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) refreshInFlight = doRefresh().finally(() => { refreshInFlight = null })
  return refreshInFlight
}

async function doRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem(REFRESH_KEY)
  if (!refreshToken) return false

  const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })

  if (!res.ok) {
    localStorage.removeItem(REFRESH_KEY)
    tokenStore.clear()
    return false
  }

  const data = await res.json()
  tokenStore.set(data.accessToken)
  localStorage.setItem(REFRESH_KEY, data.refreshToken)
  return true
}

// Wrapper de fetch con JWT automático y un reintento tras refresco de token.
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const token = tokenStore.get()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  // Con FormData el navegador define el Content-Type (multipart + boundary)
  if (!(init.body instanceof FormData))
    headers.set('Content-Type', headers.get('Content-Type') ?? 'application/json')

  const url = input.startsWith('/') ? `${API_BASE_URL}${input}` : input
  let res = await fetch(url, { ...init, headers })

  if (res.status === 401) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      headers.set('Authorization', `Bearer ${tokenStore.get()}`)
      res = await fetch(url, { ...init, headers })
    }
  }

  return res
}

// ── Catálogo general — Monedas ───────────────────────────────────────────────

interface CurrencyPayload {
  code: string
  name: string
  symbol: string
}

export const currenciesApi = {
  list:     ()                            => apiFetch('/api/currencies'),
  getById:  (id: string)                  => apiFetch(`/api/currencies/${id}`),
  create:   (data: CurrencyPayload)       => apiFetch('/api/currencies',       { method: 'POST',  body: JSON.stringify(data) }),
  update:   (id: string, data: CurrencyPayload) => apiFetch(`/api/currencies/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  toggle:   (id: string)                  => apiFetch(`/api/currencies/${id}/toggle`, { method: 'PATCH' }),
  remove:   (id: string)                  => apiFetch(`/api/currencies/${id}`,        { method: 'DELETE' }),
}

// ── Catálogo general — Países (solo lectura) ─────────────────────────────────

export const countriesApi = {
  list: (active?: boolean) => apiFetch(active === undefined ? '/api/countries' : `/api/countries?active=${active}`),
}

// ── Catálogo general — Industrias (solo lectura) ─────────────────────────────

export const industriesApi = {
  list: (active?: boolean) => apiFetch(active === undefined ? '/api/industries' : `/api/industries?active=${active}`),
}

// ── Configuración de Empresa (transversal, singleton) ────────────────────────

interface CompanySettingsPayload {
  legalName: string
  tradeName?: string
  taxId?: string
  taxRegime?: string
  address?: string
  phone?: string
  email?: string
  website?: string
  showLogoOnDocuments: boolean
}

export const companySettingsApi = {
  get:        ()                                => apiFetch('/api/company'),
  update:     (data: CompanySettingsPayload)     => apiFetch('/api/company', { method: 'PUT', body: JSON.stringify(data) }),
  uploadLogo: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiFetch('/api/company/logo', { method: 'POST', body: fd })
  },
  logoUrl:    ()                                 => apiFetch('/api/company/logo-url'),
  logo:       ()                                 => apiFetch('/api/company/logo'),
  deleteLogo: ()                                 => apiFetch('/api/company/logo', { method: 'DELETE' }),
}

// ── Módulo RR.HH. — Departamentos ────────────────────────────────────────────

interface DepartmentPayload {
  name: string
  description?: string
}

export const departmentsApi = {
  list:     ()                             => apiFetch('/api/hr/departments'),
  getById:  (id: string)                   => apiFetch(`/api/hr/departments/${id}`),
  create:   (data: DepartmentPayload)      => apiFetch('/api/hr/departments',       { method: 'POST',  body: JSON.stringify(data) }),
  update:   (id: string, data: DepartmentPayload) => apiFetch(`/api/hr/departments/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  toggle:   (id: string)                   => apiFetch(`/api/hr/departments/${id}/toggle`, { method: 'PATCH' }),
  remove:   (id: string)                   => apiFetch(`/api/hr/departments/${id}`,        { method: 'DELETE' }),
}

// ── Módulo RR.HH. — Tipos de identificación ──────────────────────────────────

interface IdentificationTypePayload {
  name: string
  description?: string
}

export const identificationTypesApi = {
  list:     ()                                     => apiFetch('/api/hr/identification-types'),
  getById:  (id: string)                           => apiFetch(`/api/hr/identification-types/${id}`),
  create:   (data: IdentificationTypePayload)      => apiFetch('/api/hr/identification-types',       { method: 'POST',  body: JSON.stringify(data) }),
  update:   (id: string, data: IdentificationTypePayload) => apiFetch(`/api/hr/identification-types/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  toggle:   (id: string)                           => apiFetch(`/api/hr/identification-types/${id}/toggle`, { method: 'PATCH' }),
  remove:   (id: string)                           => apiFetch(`/api/hr/identification-types/${id}`,        { method: 'DELETE' }),
}

// ── Módulo RR.HH. — Cargos ───────────────────────────────────────────────────

interface PositionPayload {
  name: string
  description?: string
}

export const positionsApi = {
  list:     ()                           => apiFetch('/api/hr/positions'),
  getById:  (id: string)                 => apiFetch(`/api/hr/positions/${id}`),
  create:   (data: PositionPayload)      => apiFetch('/api/hr/positions',       { method: 'POST',  body: JSON.stringify(data) }),
  update:   (id: string, data: PositionPayload) => apiFetch(`/api/hr/positions/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  toggle:   (id: string)                 => apiFetch(`/api/hr/positions/${id}/toggle`, { method: 'PATCH' }),
  remove:   (id: string)                 => apiFetch(`/api/hr/positions/${id}`,        { method: 'DELETE' }),
}

// ── Módulo RR.HH. — Empleados ────────────────────────────────────────────────

interface EmployeePayload {
  code: string
  firstName: string
  lastName: string
  email: string
  /** Teléfono de contacto; null u omitido si no se registró. */
  phone?: string | null
  /** Dirección domiciliar; null u omitida si no se registró. */
  address?: string | null
  /** Fecha de nacimiento (yyyy-MM-dd); null u omitida si no se registró. */
  birthDate?: string | null
  /** País del empleado (hr.Countries); null u omitido si no se registró. */
  countryId?: string | null
  identificationTypeId: string
  identificationNumber: string
  salary: number
  currencyId: string
  positionId: string
  departmentId: string
  /** Modalidad de trabajo (hr.WorkModalities); null u omitida si no aplica. */
  workModalityId?: string | null
  /** Tipo de contrato (hr.ContractTypes); null u omitido si no aplica. */
  contractTypeId?: string | null
  /** Base salarial de la remuneración: Monthly | Hourly | Service. */
  payUnit?: string
  /** Frecuencia de pago de la nómina: Monthly | Biweekly | Weekly. */
  payFrequency?: string
  /** Jornada laboral: Day | Night | Mixed; null u omitida si no aplica. */
  workShift?: string | null
  /** Banco de la cuenta de nómina (hr.Banks); null u omitido si no aplica. */
  bankId?: string | null
  /** Número de cuenta bancaria de nómina; null u omitido si no aplica. */
  bankAccountNumber?: string | null
  hireDate: string
}

// Directorio básico de empleados (nombre, correo, foto) — transversal a todos los
// módulos, sin requerir el módulo hr. Usar en combos de "elegí un empleado"
// (solicitante, responsable, owner…) fuera del propio módulo de RR. HH.,
// que sí usa employeesApi.list() (datos completos, requiere el módulo hr).
export const employeeDirectoryApi = {
  list: (active?: boolean) => apiFetch(`/api/employees/directory${active !== undefined ? `?active=${active}` : ''}`),
}

export const employeesApi = {
  list:     (departmentId?: string)     => apiFetch(departmentId ? `/api/hr/employees?departmentId=${departmentId}` : '/api/hr/employees'),
  getById:  (id: string)                => apiFetch(`/api/hr/employees/${id}`),
  history:  (id: string)                => apiFetch(`/api/hr/employees/${id}/history`),
  // CV del candidato de origen (contratación de reclutamiento)
  resumeUrl: (id: string)               => apiFetch(`/api/hr/employees/${id}/resume-url`),
  // Foto del empleado en Azure Blob Storage (contenedor a3hub)
  uploadPhoto: (id: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiFetch(`/api/hr/employees/${id}/photo`, { method: 'POST', body: fd })
  },
  photoUrl:    (id: string) => apiFetch(`/api/hr/employees/${id}/photo-url`),
  // Bytes de la foto servidos por el API (mismo origen, sin CORS): para incrustarla en el PDF de la ficha
  photo:       (id: string) => apiFetch(`/api/hr/employees/${id}/photo`),
  deletePhoto: (id: string) => apiFetch(`/api/hr/employees/${id}/photo`, { method: 'DELETE' }),
  // Expediente documental (CV, récord policial, identificación, títulos…)
  documents:      (id: string) => apiFetch(`/api/hr/employees/${id}/documents`),
  uploadDocument: (id: string, file: File, documentTypeId: string) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('documentTypeId', documentTypeId)
    return apiFetch(`/api/hr/employees/${id}/documents`, { method: 'POST', body: fd })
  },
  documentUrl:    (id: string, docId: string) => apiFetch(`/api/hr/employees/${id}/documents/${docId}/url`),
  deleteDocument: (id: string, docId: string) => apiFetch(`/api/hr/employees/${id}/documents/${docId}`, { method: 'DELETE' }),
  create:   (data: EmployeePayload)     => apiFetch('/api/hr/employees',       { method: 'POST',  body: JSON.stringify(data) }),
  update:   (id: string, data: EmployeePayload) => apiFetch(`/api/hr/employees/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  toggle:   (id: string)                => apiFetch(`/api/hr/employees/${id}/toggle`, { method: 'PATCH' }),
  remove:   (id: string)                => apiFetch(`/api/hr/employees/${id}`,        { method: 'DELETE' }),
}

// ── Módulo RR.HH. — Bancos ──────────────────────────────────────────────────

interface BankPayload {
  name: string
  description?: string
}

export const banksApi = {
  list:    (active?: boolean)   => apiFetch(active === undefined ? '/api/hr/banks' : `/api/hr/banks?active=${active}`),
  getById: (id: string)         => apiFetch(`/api/hr/banks/${id}`),
  create:  (data: BankPayload)  => apiFetch('/api/hr/banks',       { method: 'POST',  body: JSON.stringify(data) }),
  update:  (id: string, data: BankPayload) => apiFetch(`/api/hr/banks/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  toggle:  (id: string)         => apiFetch(`/api/hr/banks/${id}/toggle`, { method: 'PATCH' }),
  remove:  (id: string)         => apiFetch(`/api/hr/banks/${id}`,        { method: 'DELETE' }),
}

// ── Módulo RR.HH. — Modalidades de trabajo ──────────────────────────────────

interface WorkModalityPayload {
  name: string
  description?: string
}

export const workModalitiesApi = {
  list:    (active?: boolean)           => apiFetch(active === undefined ? '/api/hr/work-modalities' : `/api/hr/work-modalities?active=${active}`),
  getById: (id: string)                 => apiFetch(`/api/hr/work-modalities/${id}`),
  create:  (data: WorkModalityPayload)  => apiFetch('/api/hr/work-modalities',       { method: 'POST',  body: JSON.stringify(data) }),
  update:  (id: string, data: WorkModalityPayload) => apiFetch(`/api/hr/work-modalities/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  toggle:  (id: string)                 => apiFetch(`/api/hr/work-modalities/${id}/toggle`, { method: 'PATCH' }),
  remove:  (id: string)                 => apiFetch(`/api/hr/work-modalities/${id}`,        { method: 'DELETE' }),
}

// ── Módulo RR.HH. — Tipos de contrato ───────────────────────────────────────

interface ContractTypePayload {
  name: string
  description?: string
}

export const contractTypesApi = {
  list:    (active?: boolean)           => apiFetch(active === undefined ? '/api/hr/contract-types' : `/api/hr/contract-types?active=${active}`),
  getById: (id: string)                 => apiFetch(`/api/hr/contract-types/${id}`),
  create:  (data: ContractTypePayload)  => apiFetch('/api/hr/contract-types',       { method: 'POST',  body: JSON.stringify(data) }),
  update:  (id: string, data: ContractTypePayload) => apiFetch(`/api/hr/contract-types/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  toggle:  (id: string)                 => apiFetch(`/api/hr/contract-types/${id}/toggle`, { method: 'PATCH' }),
  remove:  (id: string)                 => apiFetch(`/api/hr/contract-types/${id}`,        { method: 'DELETE' }),
}

// ── Módulo RR.HH. — Contratos de empleados ──────────────────────────────────

interface EmployeeContractPayload {
  employeeId: string
  contractTypeId: string
  /** Fechas en formato ISO 'aaaa-mm-dd'; endDate omitida = contrato indefinido. */
  startDate: string
  endDate?: string | null
  /** Base salarial (base de cálculo): Monthly | Hourly | Service. */
  payUnit: string
  /** Frecuencia de pago (calendario de nómina): Monthly | Biweekly | Weekly. */
  payFrequency: string
  /** Jornada laboral: Day | Night | Mixed. */
  workShift?: string | null
  payRate: number
  currencyId?: string | null
  weeklyHours?: number | null
  notes?: string | null
}

interface EmployeeContractUpdatePayload {
  startDate: string
  endDate?: string | null
  payUnit: string
  payFrequency: string
  workShift?: string | null
  payRate: number
  currencyId?: string | null
  weeklyHours?: number | null
  notes?: string | null
}

/** Renovación: los campos omitidos heredan del contrato original. */
interface EmployeeContractRenewPayload {
  startDate: string
  endDate?: string | null
  payUnit?: string | null
  payFrequency?: string | null
  workShift?: string | null
  payRate?: number | null
  currencyId?: string | null
  weeklyHours?: number | null
  notes?: string | null
}

export const employeeContractsApi = {
  list: (employeeId?: string, status?: string, expiringInDays?: number) => {
    const params = new URLSearchParams()
    if (employeeId) params.set('employeeId', employeeId)
    if (status) params.set('status', status)
    if (expiringInDays !== undefined) params.set('expiringInDays', String(expiringInDays))
    const qs = params.toString()
    return apiFetch(qs ? `/api/hr/contracts?${qs}` : '/api/hr/contracts')
  },
  getById:   (id: string)                                    => apiFetch(`/api/hr/contracts/${id}`),
  create:    (data: EmployeeContractPayload)                 => apiFetch('/api/hr/contracts',       { method: 'POST',  body: JSON.stringify(data) }),
  update:    (id: string, data: EmployeeContractUpdatePayload) => apiFetch(`/api/hr/contracts/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  renew:     (id: string, data: EmployeeContractRenewPayload)  => apiFetch(`/api/hr/contracts/${id}/renew`,     { method: 'POST',  body: JSON.stringify(data) }),
  terminate: (id: string, endDate?: string, terminationType?: string, reason?: string) =>
    apiFetch(`/api/hr/contracts/${id}/terminate`, { method: 'PATCH', body: JSON.stringify({ endDate, terminationType, reason }) }),
  remove:    (id: string)                                    => apiFetch(`/api/hr/contracts/${id}`, { method: 'DELETE' }),
  // Documento firmado del contrato en Azure Blob Storage (contenedor a3hub)
  uploadDocument: (id: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiFetch(`/api/hr/contracts/${id}/document`, { method: 'POST', body: fd })
  },
  documentUrl:    (id: string) => apiFetch(`/api/hr/contracts/${id}/document-url`),
  deleteDocument: (id: string) => apiFetch(`/api/hr/contracts/${id}/document`, { method: 'DELETE' }),
}

// ── Módulo RR.HH. — Tipos de trabajo (clasificación de horas) ───────────────

interface WorkTypePayload {
  name: string
  description?: string
  /** Multiplicador sobre la tarifa hora (ej. 1.5 para extras). */
  rateMultiplier: number
}

export const workTypesApi = {
  list:    (active?: boolean)        => apiFetch(active === undefined ? '/api/hr/work-types' : `/api/hr/work-types?active=${active}`),
  getById: (id: string)              => apiFetch(`/api/hr/work-types/${id}`),
  create:  (data: WorkTypePayload)   => apiFetch('/api/hr/work-types',       { method: 'POST',  body: JSON.stringify(data) }),
  update:  (id: string, data: WorkTypePayload) => apiFetch(`/api/hr/work-types/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  toggle:  (id: string)              => apiFetch(`/api/hr/work-types/${id}/toggle`, { method: 'PATCH' }),
  remove:  (id: string)              => apiFetch(`/api/hr/work-types/${id}`,        { method: 'DELETE' }),
}

// ── Módulo RR.HH. — Registro de horas por tipo de trabajo ───────────────────

interface TimeEntryPayload {
  employeeId: string
  workTypeId: string
  /** Fecha en formato ISO 'aaaa-mm-dd'. */
  workDate: string
  hours: number
  /** Contrato al que se imputan las horas (opcional). */
  contractId?: string | null
  description?: string | null
}

export const timeEntriesApi = {
  list: (from: string, to: string, employeeId?: string, workTypeId?: string) => {
    const params = new URLSearchParams({ from, to })
    if (employeeId) params.set('employeeId', employeeId)
    if (workTypeId) params.set('workTypeId', workTypeId)
    return apiFetch(`/api/hr/time-entries?${params.toString()}`)
  },
  summary: (from: string, to: string, employeeId?: string) => {
    const params = new URLSearchParams({ from, to })
    if (employeeId) params.set('employeeId', employeeId)
    return apiFetch(`/api/hr/time-entries/summary?${params.toString()}`)
  },
  create: (data: TimeEntryPayload)             => apiFetch('/api/hr/time-entries',       { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: TimeEntryPayload) => apiFetch(`/api/hr/time-entries/${id}`, { method: 'PUT',  body: JSON.stringify(data) }),
  remove: (id: string)                         => apiFetch(`/api/hr/time-entries/${id}`, { method: 'DELETE' }),
}

// ── Módulo RR.HH. — Tipos de documento (catálogo del expediente) ────────────

interface DocumentTypePayload {
  name: string
  description?: string
}

export const documentTypesApi = {
  list:   (active?: boolean)          => apiFetch(active === undefined ? '/api/hr/document-types' : `/api/hr/document-types?active=${active}`),
  create: (data: DocumentTypePayload) => apiFetch('/api/hr/document-types', { method: 'POST', body: JSON.stringify(data) }),
}

// ── Módulo RR.HH. — Reclutamiento: Vacantes ──────────────────────────────────

interface VacancyPayload {
  title: string
  description?: string
  positionId: string
  departmentId: string
  openingsCount: number
  salaryMin?: number
  salaryMax?: number
  currencyId?: string
  closingDate?: string
}

export const vacanciesApi = {
  list:         (status?: string)                  => apiFetch(status ? `/api/hr/vacancies?status=${status}` : '/api/hr/vacancies'),
  getById:      (id: string)                       => apiFetch(`/api/hr/vacancies/${id}`),
  create:       (data: VacancyPayload)             => apiFetch('/api/hr/vacancies',       { method: 'POST',  body: JSON.stringify(data) }),
  update:       (id: string, data: VacancyPayload) => apiFetch(`/api/hr/vacancies/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  changeStatus: (id: string, status: string)       => apiFetch(`/api/hr/vacancies/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  remove:       (id: string)                       => apiFetch(`/api/hr/vacancies/${id}`,        { method: 'DELETE' }),
}

// ── Módulo RR.HH. — Reclutamiento: Candidatos ────────────────────────────────

interface CandidatePayload {
  firstName: string
  lastName: string
  email: string
  phone?: string
  resumeUrl?: string
  source?: string
  notes?: string
}

export const candidatesApi = {
  list:     ()                                   => apiFetch('/api/hr/candidates'),
  getById:  (id: string)                         => apiFetch(`/api/hr/candidates/${id}`),
  create:   (data: CandidatePayload)             => apiFetch('/api/hr/candidates',       { method: 'POST',  body: JSON.stringify(data) }),
  update:   (id: string, data: CandidatePayload) => apiFetch(`/api/hr/candidates/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  toggle:   (id: string)                         => apiFetch(`/api/hr/candidates/${id}/toggle`, { method: 'PATCH' }),
  remove:   (id: string)                         => apiFetch(`/api/hr/candidates/${id}`,        { method: 'DELETE' }),
  // Currículum en Azure Blob Storage (contenedor a3hub)
  uploadResume: (id: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiFetch(`/api/hr/candidates/${id}/resume`, { method: 'POST', body: fd })
  },
  resumeUrl:    (id: string) => apiFetch(`/api/hr/candidates/${id}/resume-url`),
  deleteResume: (id: string) => apiFetch(`/api/hr/candidates/${id}/resume`, { method: 'DELETE' }),
}

// ── Módulo RR.HH. — Reclutamiento: Postulaciones ─────────────────────────────

interface ApplicationPayload {
  vacancyId: string
  candidateId: string
  notes?: string
}

interface HirePayload {
  code: string
  identificationTypeId: string
  identificationNumber: string
  salary: number
  currencyId?: string
  hireDate: string
}

export const applicationsApi = {
  list: (vacancyId?: string, stage?: string) => {
    const params = new URLSearchParams()
    if (vacancyId) params.set('vacancyId', vacancyId)
    if (stage) params.set('stage', stage)
    const qs = params.toString()
    return apiFetch(qs ? `/api/hr/applications?${qs}` : '/api/hr/applications')
  },
  getById:     (id: string)                     => apiFetch(`/api/hr/applications/${id}`),
  history:     (id: string)                     => apiFetch(`/api/hr/applications/${id}/history`),
  create:      (data: ApplicationPayload)       => apiFetch('/api/hr/applications', { method: 'POST', body: JSON.stringify(data) }),
  updateNotes: (id: string, notes?: string)     => apiFetch(`/api/hr/applications/${id}`,       { method: 'PUT',   body: JSON.stringify({ notes }) }),
  changeStage: (id: string, stage: string)      => apiFetch(`/api/hr/applications/${id}/stage`, { method: 'PATCH', body: JSON.stringify({ stage }) }),
  hire:        (id: string, data: HirePayload)  => apiFetch(`/api/hr/applications/${id}/hire`,  { method: 'POST',  body: JSON.stringify(data) }),
  remove:      (id: string)                     => apiFetch(`/api/hr/applications/${id}`,       { method: 'DELETE' }),
}

// ── Módulo RR.HH. — Vacaciones ───────────────────────────────────────────────

interface VacationRequestPayload {
  employeeId: string
  startDate: string
  endDate: string
  reason?: string
}

interface VacationRequestUpdatePayload {
  startDate: string
  endDate: string
  reason?: string
}

interface VacationReviewPayload {
  status: 'Approved' | 'Rejected'
  reviewComment?: string
}


export const vacationsApi = {
  listRequests: (status?: string, employeeId?: string, year?: number) => {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (employeeId) params.set('employeeId', employeeId)
    if (year) params.set('year', String(year))
    const qs = params.toString()
    return apiFetch(qs ? `/api/hr/vacations/requests?${qs}` : '/api/hr/vacations/requests')
  },
  getRequestById: (id: string)                                   => apiFetch(`/api/hr/vacations/requests/${id}`),
  createRequest:  (data: VacationRequestPayload)                 => apiFetch('/api/hr/vacations/requests',       { method: 'POST',  body: JSON.stringify(data) }),
  updateRequest:  (id: string, data: VacationRequestUpdatePayload) => apiFetch(`/api/hr/vacations/requests/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  review:         (id: string, data: VacationReviewPayload)      => apiFetch(`/api/hr/vacations/requests/${id}/review`, { method: 'PATCH', body: JSON.stringify(data) }),
  cancel:         (id: string)                                   => apiFetch(`/api/hr/vacations/requests/${id}/cancel`, { method: 'PATCH' }),
  removeRequest:  (id: string)                                   => apiFetch(`/api/hr/vacations/requests/${id}`,        { method: 'DELETE' }),
  // Saldos acumulativos (devengo mensual), edición directa del saldo y configuración
  listBalances:   (employeeId?: string)                          => apiFetch(employeeId ? `/api/hr/vacations/balances?employeeId=${employeeId}` : '/api/hr/vacations/balances'),
  updateBalance:  (data: { employeeId: string; monthsWorked: number; accruedDays: number }) =>
    apiFetch('/api/hr/vacations/balances', { method: 'PUT', body: JSON.stringify(data) }),
  getSettings:    ()                                             => apiFetch('/api/hr/vacations/settings'),
  updateSettings: (accrualDaysPerMonth: number)                  => apiFetch('/api/hr/vacations/settings', { method: 'PUT', body: JSON.stringify({ accrualDaysPerMonth }) }),
}

// ── Módulo RR.HH. — Asistencia ───────────────────────────────────────────────

interface AttendancePayload {
  employeeId: string
  /** Fecha en formato ISO 'aaaa-mm-dd'. */
  workDate: string
  /** Horas en formato 'HH:mm'. */
  checkIn?: string
  checkOut?: string
  notes?: string
}

interface WorkSchedulePayload {
  name: string
  /** Horas en formato 'HH:mm'. */
  startTime: string
  endTime: string
  toleranceMinutes: number
  /** Días laborables como CSV ISO: 1=lunes … 7=domingo. */
  workDays: string
  isDefault: boolean
}

interface HolidayPayload {
  name: string
  /** Fecha en formato ISO 'aaaa-mm-dd'. */
  holidayDate: string
  isRecurring: boolean
}

export const attendanceApi = {
  // Automarcaje público del kiosco del login (sin sesión)
  mark:           (employeeCode: string, type: 'In' | 'Out') => apiFetch('/api/hr/attendance/mark', { method: 'POST', body: JSON.stringify({ employeeCode, type }) }),
  day:            (date: string)                            => apiFetch(`/api/hr/attendance/day?date=${date}`),
  upsertRecord:   (data: AttendancePayload)                 => apiFetch('/api/hr/attendance/records', { method: 'POST', body: JSON.stringify(data) }),
  removeRecord:   (id: string)                              => apiFetch(`/api/hr/attendance/records/${id}`, { method: 'DELETE' }),
  summary:        (year: number, month: number)             => apiFetch(`/api/hr/attendance/summary?year=${year}&month=${month}`),
  // Horarios de trabajo y su asignación por empleado
  schedules:      (active?: boolean)                        => apiFetch(active === undefined ? '/api/hr/attendance/schedules' : `/api/hr/attendance/schedules?active=${active}`),
  createSchedule: (data: WorkSchedulePayload)               => apiFetch('/api/hr/attendance/schedules', { method: 'POST', body: JSON.stringify(data) }),
  updateSchedule: (id: string, data: WorkSchedulePayload)   => apiFetch(`/api/hr/attendance/schedules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  removeSchedule: (id: string)                              => apiFetch(`/api/hr/attendance/schedules/${id}`, { method: 'DELETE' }),
  // Turnos con vigencia: la asignación aplica desde effectiveFrom (omitida = hoy)
  assignSchedule: (employeeId: string, scheduleId: string | null, effectiveFrom?: string) => apiFetch('/api/hr/attendance/schedules/assignment', { method: 'PUT', body: JSON.stringify({ employeeId, scheduleId, effectiveFrom }) }),
  scheduleAssignments: (employeeId: string)                 => apiFetch(`/api/hr/attendance/schedules/assignments/${employeeId}`),
  // Feriados del calendario laboral
  holidays:       ()                                        => apiFetch('/api/hr/attendance/holidays'),
  createHoliday:  (data: HolidayPayload)                    => apiFetch('/api/hr/attendance/holidays', { method: 'POST', body: JSON.stringify(data) }),
  updateHoliday:  (id: string, data: HolidayPayload)        => apiFetch(`/api/hr/attendance/holidays/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  removeHoliday:  (id: string)                              => apiFetch(`/api/hr/attendance/holidays/${id}`, { method: 'DELETE' }),
}

// ── Módulo RR.HH. — Ausencias e incapacidades ────────────────────────────────

interface LeaveTypePayload {
  name: string
  description?: string
  isPaid?: boolean
  requiresDocument?: boolean
}

interface EmployeeLeavePayload {
  employeeId: string
  leaveTypeId: string
  /** Fechas en formato ISO 'aaaa-mm-dd'. */
  startDate: string
  endDate: string
  documentNumber?: string
  notes?: string
}

interface EmployeeLeaveUpdatePayload {
  leaveTypeId: string
  startDate: string
  endDate: string
  documentNumber?: string
  notes?: string
}

export const leaveTypesApi = {
  list:   (active?: boolean)       => apiFetch(active === undefined ? '/api/hr/leaves/types' : `/api/hr/leaves/types?active=${active}`),
  create: (data: LeaveTypePayload) => apiFetch('/api/hr/leaves/types', { method: 'POST', body: JSON.stringify(data) }),
}

export const leavesApi = {
  list: (status?: string, employeeId?: string, year?: number) => {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (employeeId) params.set('employeeId', employeeId)
    if (year) params.set('year', String(year))
    const qs = params.toString()
    return apiFetch(qs ? `/api/hr/leaves?${qs}` : '/api/hr/leaves')
  },
  getById: (id: string)                                  => apiFetch(`/api/hr/leaves/${id}`),
  create:  (data: EmployeeLeavePayload)                  => apiFetch('/api/hr/leaves',       { method: 'POST',  body: JSON.stringify(data) }),
  update:  (id: string, data: EmployeeLeaveUpdatePayload) => apiFetch(`/api/hr/leaves/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  void:    (id: string)                                  => apiFetch(`/api/hr/leaves/${id}/void`, { method: 'PATCH' }),
  remove:  (id: string)                                  => apiFetch(`/api/hr/leaves/${id}`,      { method: 'DELETE' }),
}

// ── Módulo RR.HH. — Nómina (motor parametrizable por conceptos) ──────────────

export interface PayrollConceptPayload {
  code: string
  name: string
  conceptType: string          // Earning | Deduction | EmployerContribution
  calcType: string             // Fixed | Percent | Brackets
  baseType?: string | null     // BaseSalary | Gross | Taxable
  defaultAmount?: number | null
  percentage?: number | null
  baseCapAmount?: number | null
  annualizationFactor?: number | null
  affectsTaxable: boolean
  appliesToAll: boolean
  calcOrder: number
}

export interface PayrollBracketPayload {
  lowerLimit: number
  upperLimit?: number | null
  fixedQuota: number
  ratePercent: number
}

export interface PayrollExchangeRatePayload {
  currencyId: string
  rate: number
}

export interface PayrollPeriodPayload {
  name: string
  payFrequency: string         // Monthly | Biweekly | Weekly
  /** Fechas en formato ISO 'aaaa-mm-dd'. */
  startDate: string
  endDate: string
  payDate: string
  /** Moneda en la que se consolidan los totales del período. */
  baseCurrencyId: string
  /** Tasa de cambio de cada moneda distinta a la base que paguen empleados del período. */
  exchangeRates: PayrollExchangeRatePayload[]
  /** Fecha en que se consultaron las tasas de cambio anteriores (ISO 'aaaa-mm-dd'). */
  rateDate?: string
  notes?: string
}

export interface PayrollExchangeRatesPayload {
  baseCurrencyId: string
  exchangeRates: PayrollExchangeRatePayload[]
  /** Fecha en que se consultaron las tasas de cambio anteriores (ISO 'aaaa-mm-dd'). */
  rateDate?: string
}

export interface PayrollNoveltyPayload {
  employeeId: string
  conceptId: string
  amount: number
  notes?: string
}

export interface EmployeeConceptPayload {
  employeeId: string
  conceptId: string
  overrideAmount?: number | null
  startDate?: string
  endDate?: string
  notes?: string
}

export const payrollApi = {
  // Conceptos
  concepts:        (active?: boolean)                          => apiFetch(active === undefined ? '/api/hr/payroll/concepts' : `/api/hr/payroll/concepts?active=${active}`),
  createConcept:   (data: PayrollConceptPayload)               => apiFetch('/api/hr/payroll/concepts',        { method: 'POST',  body: JSON.stringify(data) }),
  updateConcept:   (id: string, data: PayrollConceptPayload)   => apiFetch(`/api/hr/payroll/concepts/${id}`,  { method: 'PUT',   body: JSON.stringify(data) }),
  toggleConcept:   (id: string)                                => apiFetch(`/api/hr/payroll/concepts/${id}/toggle`, { method: 'PATCH' }),
  removeConcept:   (id: string)                                => apiFetch(`/api/hr/payroll/concepts/${id}`,  { method: 'DELETE' }),
  brackets:        (conceptId: string)                         => apiFetch(`/api/hr/payroll/concepts/${conceptId}/brackets`),
  replaceBrackets: (conceptId: string, data: PayrollBracketPayload[]) => apiFetch(`/api/hr/payroll/concepts/${conceptId}/brackets`, { method: 'PUT', body: JSON.stringify(data) }),
  // Asignaciones recurrentes por empleado
  employeeConcepts: (employeeId?: string, conceptId?: string) => {
    const params = new URLSearchParams()
    if (employeeId) params.set('employeeId', employeeId)
    if (conceptId) params.set('conceptId', conceptId)
    const qs = params.toString()
    return apiFetch(qs ? `/api/hr/payroll/employee-concepts?${qs}` : '/api/hr/payroll/employee-concepts')
  },
  assignConcept:   (data: EmployeeConceptPayload) => apiFetch('/api/hr/payroll/employee-concepts',        { method: 'POST', body: JSON.stringify(data) }),
  unassignConcept: (id: string)                   => apiFetch(`/api/hr/payroll/employee-concepts/${id}`,  { method: 'DELETE' }),
  // Períodos y su ciclo de vida
  periods:       ()                            => apiFetch('/api/hr/payroll/periods'),
  createPeriod:  (data: PayrollPeriodPayload)  => apiFetch('/api/hr/payroll/periods', { method: 'POST', body: JSON.stringify(data) }),
  calculate:     (id: string)                  => apiFetch(`/api/hr/payroll/periods/${id}/calculate`, { method: 'POST' }),
  approve:       (id: string)                  => apiFetch(`/api/hr/payroll/periods/${id}/approve`,   { method: 'PATCH' }),
  pay:           (id: string)                  => apiFetch(`/api/hr/payroll/periods/${id}/pay`,       { method: 'PATCH' }),
  reopen:        (id: string)                  => apiFetch(`/api/hr/payroll/periods/${id}/reopen`,    { method: 'PATCH' }),
  removePeriod:  (id: string)                  => apiFetch(`/api/hr/payroll/periods/${id}`,           { method: 'DELETE' }),
  // Tasas de cambio del período (moneda base y monedas distintas en uso)
  exchangeRates:        (periodId: string)                                => apiFetch(`/api/hr/payroll/periods/${periodId}/exchange-rates`),
  replaceExchangeRates: (periodId: string, data: PayrollExchangeRatesPayload) => apiFetch(`/api/hr/payroll/periods/${periodId}/exchange-rates`, { method: 'PUT', body: JSON.stringify(data) }),
  // Novedades del período
  novelties:     (periodId: string)                                => apiFetch(`/api/hr/payroll/periods/${periodId}/novelties`),
  addNovelty:    (periodId: string, data: PayrollNoveltyPayload)   => apiFetch(`/api/hr/payroll/periods/${periodId}/novelties`, { method: 'POST', body: JSON.stringify(data) }),
  removeNovelty: (id: string)                                      => apiFetch(`/api/hr/payroll/novelties/${id}`, { method: 'DELETE' }),
  // Resultados
  details:     (periodId: string) => apiFetch(`/api/hr/payroll/periods/${periodId}/details`),
  detailLines: (detailId: string) => apiFetch(`/api/hr/payroll/details/${detailId}/lines`),
}

// ── Módulo Gestión de Proyectos — Proyectos ──────────────────────────────────

interface ProjectPayload {
  code: string
  name: string
  description?: string
  managerId?: string
  startDate: string
  endDate?: string
  status: string
  budget?: number
}

export const projectsApi = {
  list:     (params?: { active?: boolean; status?: string }) => {
    const qs = new URLSearchParams()
    if (params?.active !== undefined) qs.set('active', String(params.active))
    if (params?.status) qs.set('status', params.status)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/api/projects${suffix}`)
  },
  getById:  (id: string)                    => apiFetch(`/api/projects/${id}`),
  create:   (data: ProjectPayload)          => apiFetch('/api/projects',       { method: 'POST',  body: JSON.stringify(data) }),
  update:   (id: string, data: ProjectPayload) => apiFetch(`/api/projects/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  toggle:   (id: string)                    => apiFetch(`/api/projects/${id}/toggle`, { method: 'PATCH' }),
  remove:   (id: string)                    => apiFetch(`/api/projects/${id}`,        { method: 'DELETE' }),
}

// ── Módulo Gestión de Proyectos — Tareas ─────────────────────────────────────

interface TaskPayload {
  projectId: string
  name: string
  description?: string
  assignedToId?: string
  startDate?: string
  dueDate?: string
  status: string
  priority: string
  progressPercent: number
}

export const tasksApi = {
  list:     (params?: { projectId?: string; active?: boolean; status?: string; mine?: boolean }) => {
    const qs = new URLSearchParams()
    if (params?.projectId) qs.set('projectId', params.projectId)
    if (params?.active !== undefined) qs.set('active', String(params.active))
    if (params?.status) qs.set('status', params.status)
    if (params?.mine) qs.set('mine', 'true')
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/api/projects/tasks${suffix}`)
  },
  schedule: (projectId?: string)            => apiFetch(`/api/projects/tasks/schedule${projectId ? `?projectId=${projectId}` : ''}`),
  getById:  (id: string)                    => apiFetch(`/api/projects/tasks/${id}`),
  create:   (data: TaskPayload)             => apiFetch('/api/projects/tasks',       { method: 'POST',  body: JSON.stringify(data) }),
  update:   (id: string, data: TaskPayload) => apiFetch(`/api/projects/tasks/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  toggle:   (id: string)                    => apiFetch(`/api/projects/tasks/${id}/toggle`, { method: 'PATCH' }),
  remove:   (id: string)                    => apiFetch(`/api/projects/tasks/${id}`,        { method: 'DELETE' }),
}

// ── Módulo Gestión de Proyectos — Recursos ───────────────────────────────────

interface ResourcePayload {
  projectId: string
  employeeId: string
}

export const resourcesApi = {
  list:     (params?: { projectId?: string; active?: boolean }) => {
    const qs = new URLSearchParams()
    if (params?.projectId) qs.set('projectId', params.projectId)
    if (params?.active !== undefined) qs.set('active', String(params.active))
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/api/projects/resources${suffix}`)
  },
  getById:  (id: string)                        => apiFetch(`/api/projects/resources/${id}`),
  create:   (data: ResourcePayload)             => apiFetch('/api/projects/resources',       { method: 'POST',  body: JSON.stringify(data) }),
  update:   (id: string, data: ResourcePayload) => apiFetch(`/api/projects/resources/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  toggle:   (id: string)                        => apiFetch(`/api/projects/resources/${id}/toggle`, { method: 'PATCH' }),
  remove:   (id: string)                        => apiFetch(`/api/projects/resources/${id}`,        { method: 'DELETE' }),
}

// ── Módulo Gestión de Proyectos — Dependencias entre tareas ──────────────────

export const taskDependenciesApi = {
  listByTask:    (taskId: string)    => apiFetch(`/api/projects/tasks/dependencies?taskId=${taskId}`),
  listByProject: (projectId: string) => apiFetch(`/api/projects/tasks/dependencies/by-project?projectId=${projectId}`),
  create:        (taskId: string, dependsOnTaskId: string) => apiFetch('/api/projects/tasks/dependencies', { method: 'POST', body: JSON.stringify({ taskId, dependsOnTaskId }) }),
  remove:        (id: string)        => apiFetch(`/api/projects/tasks/dependencies/${id}`, { method: 'DELETE' }),
}

// ── Módulo Gestión de Proyectos — Comentarios de tarea ───────────────────────

export const taskCommentsApi = {
  list:   (taskId: string)              => apiFetch(`/api/projects/tasks/comments?taskId=${taskId}`),
  create: (taskId: string, text: string) => apiFetch(`/api/projects/tasks/comments/${taskId}`, { method: 'POST', body: JSON.stringify({ text }) }),
  remove: (id: string)                  => apiFetch(`/api/projects/tasks/comments/${id}`, { method: 'DELETE' }),
}

// ── Módulo Gestión de Proyectos — Adjuntos de tarea ──────────────────────────

export const taskAttachmentsApi = {
  list:   (taskId: string)         => apiFetch(`/api/projects/tasks/${taskId}/attachments`),
  upload: (taskId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return apiFetch(`/api/projects/tasks/${taskId}/attachments`, { method: 'POST', body: formData })
  },
  getUrl: (id: string) => apiFetch(`/api/projects/tasks/attachments/${id}/url`),
  remove: (id: string) => apiFetch(`/api/projects/tasks/attachments/${id}`, { method: 'DELETE' }),
}

// ── Módulo Gestión de Proyectos — Checklist de tarea ─────────────────────────

export const taskChecklistApi = {
  list:   (taskId: string)         => apiFetch(`/api/projects/tasks/checklist?taskId=${taskId}`),
  create: (taskId: string, text: string) => apiFetch(`/api/projects/tasks/checklist/${taskId}`, { method: 'POST', body: JSON.stringify({ text }) }),
  toggle: (id: string) => apiFetch(`/api/projects/tasks/checklist/${id}/toggle`, { method: 'PATCH' }),
  remove: (id: string) => apiFetch(`/api/projects/tasks/checklist/${id}`, { method: 'DELETE' }),
}

// ── Módulo CRM — Empresas ─────────────────────────────────────────────────────

interface CompanyPayload {
  name: string
  taxId?: string
  industryId?: string
  countryId?: string
  email?: string
  phone?: string
  address?: string
  ownerId?: string
}

export const companiesApi = {
  list:     (params?: { active?: boolean }) => {
    const qs = new URLSearchParams()
    if (params?.active !== undefined) qs.set('active', String(params.active))
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/api/crm/companies${suffix}`)
  },
  getById:  (id: string)                       => apiFetch(`/api/crm/companies/${id}`),
  create:   (data: CompanyPayload)             => apiFetch('/api/crm/companies',       { method: 'POST',  body: JSON.stringify(data) }),
  update:   (id: string, data: CompanyPayload) => apiFetch(`/api/crm/companies/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  toggle:   (id: string)                       => apiFetch(`/api/crm/companies/${id}/toggle`, { method: 'PATCH' }),
  remove:   (id: string)                       => apiFetch(`/api/crm/companies/${id}`,        { method: 'DELETE' }),
}

// ── Módulo CRM — Notas de Empresa ──────────────────────────────────────────────

export const companyNotesApi = {
  list:   (companyId: string) => apiFetch(`/api/crm/companies/notes?companyId=${companyId}`),
  create: (companyId: string, text: string, file?: File) => {
    const formData = new FormData()
    if (text) formData.append('text', text)
    if (file) formData.append('file', file)
    return apiFetch(`/api/crm/companies/notes/${companyId}`, { method: 'POST', body: formData })
  },
  getUrl: (id: string) => apiFetch(`/api/crm/companies/notes/${id}/url`),
  remove: (id: string) => apiFetch(`/api/crm/companies/notes/${id}`, { method: 'DELETE' }),
}

// ── Módulo CRM — Sucursales ───────────────────────────────────────────────────

interface BranchPayload {
  companyId: string
  name: string
  taxId?: string
  address?: string
  phone?: string
  email?: string
  isMain: boolean
}

export const branchesApi = {
  list:     (params?: { companyId?: string; active?: boolean }) => {
    const qs = new URLSearchParams()
    if (params?.companyId) qs.set('companyId', params.companyId)
    if (params?.active !== undefined) qs.set('active', String(params.active))
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/api/crm/branches${suffix}`)
  },
  getById:  (id: string)                      => apiFetch(`/api/crm/branches/${id}`),
  create:   (data: BranchPayload)             => apiFetch('/api/crm/branches',       { method: 'POST',  body: JSON.stringify(data) }),
  update:   (id: string, data: BranchPayload) => apiFetch(`/api/crm/branches/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  toggle:   (id: string)                      => apiFetch(`/api/crm/branches/${id}/toggle`, { method: 'PATCH' }),
  remove:   (id: string)                      => apiFetch(`/api/crm/branches/${id}`,        { method: 'DELETE' }),
}

// ── Módulo CRM — Contactos ────────────────────────────────────────────────────

interface ContactPayload {
  companyId: string
  branchId?: string
  name: string
  position?: string
  email?: string
  phones: string[]
  isPrimary: boolean
  notes?: string
}

export const contactsApi = {
  list:     (params?: { companyId?: string; branchId?: string; active?: boolean }) => {
    const qs = new URLSearchParams()
    if (params?.companyId) qs.set('companyId', params.companyId)
    if (params?.branchId) qs.set('branchId', params.branchId)
    if (params?.active !== undefined) qs.set('active', String(params.active))
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/api/crm/contacts${suffix}`)
  },
  getById:  (id: string)                       => apiFetch(`/api/crm/contacts/${id}`),
  create:   (data: ContactPayload)             => apiFetch('/api/crm/contacts',       { method: 'POST',  body: JSON.stringify(data) }),
  update:   (id: string, data: ContactPayload) => apiFetch(`/api/crm/contacts/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  toggle:   (id: string)                       => apiFetch(`/api/crm/contacts/${id}/toggle`, { method: 'PATCH' }),
  remove:   (id: string)                       => apiFetch(`/api/crm/contacts/${id}`,        { method: 'DELETE' }),
}

// ── Módulo CRM — Oportunidades ────────────────────────────────────────────────

interface OpportunityPayload {
  clientId: string
  contactId?: string
  name: string
  stage: string
  value?: number
  probability: number
  expectedCloseDate?: string
  ownerId?: string
  notes?: string
}

export const opportunitiesApi = {
  list:     (params?: { clientId?: string; active?: boolean; stage?: string }) => {
    const qs = new URLSearchParams()
    if (params?.clientId) qs.set('clientId', params.clientId)
    if (params?.active !== undefined) qs.set('active', String(params.active))
    if (params?.stage) qs.set('stage', params.stage)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/api/crm/opportunities${suffix}`)
  },
  getById:  (id: string)                           => apiFetch(`/api/crm/opportunities/${id}`),
  create:   (data: OpportunityPayload)             => apiFetch('/api/crm/opportunities',       { method: 'POST',  body: JSON.stringify(data) }),
  update:   (id: string, data: OpportunityPayload) => apiFetch(`/api/crm/opportunities/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  toggle:   (id: string)                           => apiFetch(`/api/crm/opportunities/${id}/toggle`, { method: 'PATCH' }),
  remove:   (id: string)                           => apiFetch(`/api/crm/opportunities/${id}`,        { method: 'DELETE' }),
}

// ── Módulo CRM — Actividades ──────────────────────────────────────────────────

interface ActivityPayload {
  clientId: string
  contactId?: string
  opportunityId?: string
  type: string
  subject: string
  description?: string
  activityDate: string
  ownerId?: string
}

export const activitiesApi = {
  list:     (params?: { clientId?: string; contactId?: string; opportunityId?: string; active?: boolean }) => {
    const qs = new URLSearchParams()
    if (params?.clientId) qs.set('clientId', params.clientId)
    if (params?.contactId) qs.set('contactId', params.contactId)
    if (params?.opportunityId) qs.set('opportunityId', params.opportunityId)
    if (params?.active !== undefined) qs.set('active', String(params.active))
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/api/crm/activities${suffix}`)
  },
  getById:  (id: string)                         => apiFetch(`/api/crm/activities/${id}`),
  create:   (data: ActivityPayload)             => apiFetch('/api/crm/activities',       { method: 'POST',  body: JSON.stringify(data) }),
  update:   (id: string, data: ActivityPayload) => apiFetch(`/api/crm/activities/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  toggle:   (id: string)                         => apiFetch(`/api/crm/activities/${id}/toggle`, { method: 'PATCH' }),
  remove:   (id: string)                         => apiFetch(`/api/crm/activities/${id}`,        { method: 'DELETE' }),
}

// ── Módulo Ventas — Productos y Servicios ────────────────────────────────────

interface ProductPayload {
  code: string
  name: string
  description?: string
  type: string
  price: number
  currencyId: string
  taxRate: number
}

export const productsApi = {
  list:     (params?: { active?: boolean; type?: string }) => {
    const qs = new URLSearchParams()
    if (params?.active !== undefined) qs.set('active', String(params.active))
    if (params?.type) qs.set('type', params.type)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/api/ventas/products${suffix}`)
  },
  getById:  (id: string)                      => apiFetch(`/api/ventas/products/${id}`),
  create:   (data: ProductPayload)             => apiFetch('/api/ventas/products',       { method: 'POST',  body: JSON.stringify(data) }),
  update:   (id: string, data: ProductPayload) => apiFetch(`/api/ventas/products/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  toggle:   (id: string)                      => apiFetch(`/api/ventas/products/${id}/toggle`, { method: 'PATCH' }),
  remove:   (id: string)                      => apiFetch(`/api/ventas/products/${id}`,        { method: 'DELETE' }),
}

// ── Módulo Ventas — Cotizaciones ─────────────────────────────────────────────

interface LinePayload {
  productId: string
  description?: string
  quantity: number
  unitPrice: number
  taxRate: number
}

interface QuotePayload {
  clientId: string
  contactId?: string
  opportunityId?: string
  issueDate: string
  expirationDate?: string
  currencyId: string
  ownerId?: string
  notes?: string
  lines: LinePayload[]
}

export const quotesApi = {
  list:      (params?: { clientId?: string; active?: boolean; status?: string }) => {
    const qs = new URLSearchParams()
    if (params?.clientId) qs.set('clientId', params.clientId)
    if (params?.active !== undefined) qs.set('active', String(params.active))
    if (params?.status) qs.set('status', params.status)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/api/ventas/quotes${suffix}`)
  },
  getById:   (id: string)                      => apiFetch(`/api/ventas/quotes/${id}`),
  getLines:  (id: string)                      => apiFetch(`/api/ventas/quotes/${id}/lines`),
  create:    (data: QuotePayload)             => apiFetch('/api/ventas/quotes',       { method: 'POST',  body: JSON.stringify(data) }),
  update:    (id: string, data: QuotePayload) => apiFetch(`/api/ventas/quotes/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  changeStatus: (id: string, status: string)  => apiFetch(`/api/ventas/quotes/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  toggle:    (id: string)                      => apiFetch(`/api/ventas/quotes/${id}/toggle`, { method: 'PATCH' }),
  remove:    (id: string)                      => apiFetch(`/api/ventas/quotes/${id}`,        { method: 'DELETE' }),
  convert:   (id: string, data: { orderDate: string; deliveryDate?: string }) =>
    apiFetch(`/api/ventas/quotes/${id}/convert`, { method: 'POST', body: JSON.stringify(data) }),
}

// ── Módulo Ventas — Órdenes de Venta ─────────────────────────────────────────

interface SalesOrderPayload {
  clientId: string
  contactId?: string
  orderDate: string
  deliveryDate?: string
  currencyId: string
  ownerId?: string
  notes?: string
  lines: LinePayload[]
}

export const salesOrdersApi = {
  list:      (params?: { clientId?: string; active?: boolean; status?: string }) => {
    const qs = new URLSearchParams()
    if (params?.clientId) qs.set('clientId', params.clientId)
    if (params?.active !== undefined) qs.set('active', String(params.active))
    if (params?.status) qs.set('status', params.status)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/api/ventas/orders${suffix}`)
  },
  getById:   (id: string)                          => apiFetch(`/api/ventas/orders/${id}`),
  getLines:  (id: string)                          => apiFetch(`/api/ventas/orders/${id}/lines`),
  create:    (data: SalesOrderPayload)             => apiFetch('/api/ventas/orders',       { method: 'POST',  body: JSON.stringify(data) }),
  update:    (id: string, data: SalesOrderPayload) => apiFetch(`/api/ventas/orders/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  changeStatus: (id: string, status: string)       => apiFetch(`/api/ventas/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  toggle:    (id: string)                          => apiFetch(`/api/ventas/orders/${id}/toggle`, { method: 'PATCH' }),
  remove:    (id: string)                          => apiFetch(`/api/ventas/orders/${id}`,        { method: 'DELETE' }),
  convert:   (id: string, data: { title: string; startDate: string; endDate?: string }) =>
    apiFetch(`/api/ventas/orders/${id}/convert`, { method: 'POST', body: JSON.stringify(data) }),
}

// ── Módulo Ventas — Contratos ─────────────────────────────────────────────────

interface ContractPayload {
  clientId: string
  title: string
  startDate: string
  endDate?: string
  value: number
  currencyId: string
  ownerId?: string
  notes?: string
}

export const contractsApi = {
  list:      (params?: { clientId?: string; active?: boolean; status?: string }) => {
    const qs = new URLSearchParams()
    if (params?.clientId) qs.set('clientId', params.clientId)
    if (params?.active !== undefined) qs.set('active', String(params.active))
    if (params?.status) qs.set('status', params.status)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/api/ventas/contracts${suffix}`)
  },
  getById:      (id: string)                      => apiFetch(`/api/ventas/contracts/${id}`),
  create:       (data: ContractPayload)             => apiFetch('/api/ventas/contracts',       { method: 'POST',  body: JSON.stringify(data) }),
  update:       (id: string, data: ContractPayload) => apiFetch(`/api/ventas/contracts/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  changeStatus: (id: string, status: string)      => apiFetch(`/api/ventas/contracts/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  toggle:       (id: string)                      => apiFetch(`/api/ventas/contracts/${id}/toggle`, { method: 'PATCH' }),
  remove:       (id: string)                      => apiFetch(`/api/ventas/contracts/${id}`,        { method: 'DELETE' }),
  uploadDocument: (id: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiFetch(`/api/ventas/contracts/${id}/document`, { method: 'POST', body: form })
  },
  getDocumentUrl: (id: string) => apiFetch(`/api/ventas/contracts/${id}/document-url`),
  removeDocument: (id: string) => apiFetch(`/api/ventas/contracts/${id}/document`, { method: 'DELETE' }),
}

// ── Módulo Helpdesk — Categorías ──────────────────────────────────────────────

interface TicketCategoryPayload {
  name: string
  description?: string
}

export const ticketCategoriesApi = {
  list:    (params?: { active?: boolean }) => {
    const qs = new URLSearchParams()
    if (params?.active !== undefined) qs.set('active', String(params.active))
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/api/helpdesk/categories${suffix}`)
  },
  create:  (data: TicketCategoryPayload)             => apiFetch('/api/helpdesk/categories',       { method: 'POST', body: JSON.stringify(data) }),
  update:  (id: string, data: TicketCategoryPayload) => apiFetch(`/api/helpdesk/categories/${id}`, { method: 'PUT',  body: JSON.stringify(data) }),
  toggle:  (id: string)                              => apiFetch(`/api/helpdesk/categories/${id}/toggle`, { method: 'PATCH' }),
  remove:  (id: string)                              => apiFetch(`/api/helpdesk/categories/${id}`,        { method: 'DELETE' }),
}

// ── Módulo Helpdesk — Prioridades ─────────────────────────────────────────────

interface PriorityPayload {
  name: string
  level: number
  colorHex: string
  responseTargetMinutes?: number
  resolutionTargetMinutes?: number
}

export const prioritiesApi = {
  list:    (params?: { active?: boolean }) => {
    const qs = new URLSearchParams()
    if (params?.active !== undefined) qs.set('active', String(params.active))
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/api/helpdesk/priorities${suffix}`)
  },
  create:  (data: PriorityPayload)             => apiFetch('/api/helpdesk/priorities',       { method: 'POST', body: JSON.stringify(data) }),
  update:  (id: string, data: PriorityPayload) => apiFetch(`/api/helpdesk/priorities/${id}`, { method: 'PUT',  body: JSON.stringify(data) }),
  toggle:  (id: string)                        => apiFetch(`/api/helpdesk/priorities/${id}/toggle`, { method: 'PATCH' }),
  remove:  (id: string)                        => apiFetch(`/api/helpdesk/priorities/${id}`,        { method: 'DELETE' }),
}

// ── Módulo Helpdesk — Estados de ticket ───────────────────────────────────────

interface TicketStatusPayload {
  name: string
  colorHex: string
  sortOrder: number
  isInitial: boolean
  isFinal: boolean
  requiresResolution: boolean
  allowedTransitionIds: string[]
}

export const ticketStatusesApi = {
  list:        (params?: { active?: boolean }) => {
    const qs = new URLSearchParams()
    if (params?.active !== undefined) qs.set('active', String(params.active))
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/api/helpdesk/statuses${suffix}`)
  },
  transitions: (fromStatusId?: string) => apiFetch(`/api/helpdesk/statuses/transitions${fromStatusId ? `?fromStatusId=${fromStatusId}` : ''}`),
  create:      (data: TicketStatusPayload)             => apiFetch('/api/helpdesk/statuses',       { method: 'POST', body: JSON.stringify(data) }),
  update:      (id: string, data: TicketStatusPayload) => apiFetch(`/api/helpdesk/statuses/${id}`, { method: 'PUT',  body: JSON.stringify(data) }),
  toggle:      (id: string)                            => apiFetch(`/api/helpdesk/statuses/${id}/toggle`, { method: 'PATCH' }),
  remove:      (id: string)                            => apiFetch(`/api/helpdesk/statuses/${id}`,        { method: 'DELETE' }),
}

// ── Módulo Helpdesk — Tickets ──────────────────────────────────────────────────

interface TicketPayload {
  subject: string
  description?: string
  requesterId: string
  categoryId: string
  priorityId: string
  assignedToId?: string
}

interface TicketUpdatePayload {
  subject: string
  description?: string
  categoryId: string
  priorityId: string
}

export const ticketsApi = {
  list:      (params?: { requesterId?: string; assignedToId?: string; categoryId?: string; priorityId?: string; statusId?: string; active?: boolean }) => {
    const qs = new URLSearchParams()
    if (params?.requesterId) qs.set('requesterId', params.requesterId)
    if (params?.assignedToId) qs.set('assignedToId', params.assignedToId)
    if (params?.categoryId) qs.set('categoryId', params.categoryId)
    if (params?.priorityId) qs.set('priorityId', params.priorityId)
    if (params?.statusId) qs.set('statusId', params.statusId)
    if (params?.active !== undefined) qs.set('active', String(params.active))
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/api/helpdesk/tickets${suffix}`)
  },
  getById:      (id: string)                            => apiFetch(`/api/helpdesk/tickets/${id}`),
  create:       (data: TicketPayload)                   => apiFetch('/api/helpdesk/tickets',       { method: 'POST', body: JSON.stringify(data) }),
  update:       (id: string, data: TicketUpdatePayload) => apiFetch(`/api/helpdesk/tickets/${id}`, { method: 'PUT',  body: JSON.stringify(data) }),
  changeStatus: (id: string, statusId: string, resolution?: string) => apiFetch(`/api/helpdesk/tickets/${id}/status`, { method: 'PATCH', body: JSON.stringify({ statusId, resolution }) }),
  remove:       (id: string)                            => apiFetch(`/api/helpdesk/tickets/${id}`,        { method: 'DELETE' }),
  // Asignar/reasignar a cualquier agente (requiere helpdesk.tickets.manage-all) o dejar sin asignar.
  assign:       (id: string, assignedToId: string | null) => apiFetch(`/api/helpdesk/tickets/${id}/assign`, { method: 'PATCH', body: JSON.stringify({ assignedToId }) }),
  // Tomar un ticket sin asignar para uno mismo, sin necesitar manage-all — no
  // existe "soltar": una vez tomado, solo un supervisor puede reasignarlo.
  claim:        (id: string)                              => apiFetch(`/api/helpdesk/tickets/${id}/claim`,  { method: 'PATCH' }),
  agents:       ()                                        => apiFetch('/api/helpdesk/tickets/agents'),
}

// ── Helpdesk — Autoservicio (usuarios sin el módulo Helpdesk) ─────────────────

interface SelfTicketPayload {
  subject: string
  description?: string
  categoryId: string
  priorityId: string
}

export const helpdeskSelfApi = {
  categories:  () => apiFetch('/api/helpdesk/self/categories'),
  priorities:  () => apiFetch('/api/helpdesk/self/priorities'),
  statuses:    () => apiFetch('/api/helpdesk/self/statuses'),
  myTickets:   () => apiFetch('/api/helpdesk/self/tickets'),
  createTicket: (data: SelfTicketPayload) => apiFetch('/api/helpdesk/self/tickets', { method: 'POST', body: JSON.stringify(data) }),
  getAttachments: (ticketId: string) => apiFetch(`/api/helpdesk/self/tickets/${ticketId}/attachments`),
  uploadAttachment: (ticketId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return apiFetch(`/api/helpdesk/self/tickets/${ticketId}/attachments`, { method: 'POST', body: formData })
  },
  getAttachmentUrl: (attachmentId: string) => apiFetch(`/api/helpdesk/self/attachments/${attachmentId}/url`),
  removeAttachment: (attachmentId: string) => apiFetch(`/api/helpdesk/self/attachments/${attachmentId}`, { method: 'DELETE' }),
  removeTicket: (ticketId: string) => apiFetch(`/api/helpdesk/self/tickets/${ticketId}`, { method: 'DELETE' }),
  getComments: (ticketId: string) => apiFetch(`/api/helpdesk/self/tickets/${ticketId}/comments`),
  createComment: (ticketId: string, text: string) => apiFetch(`/api/helpdesk/self/tickets/${ticketId}/comments`, { method: 'POST', body: JSON.stringify({ text }) }),
}

// ── Notificaciones (genérico, cualquier módulo) ───────────────────────────────

export const notificationsApi = {
  list:        (top?: number) => apiFetch(`/api/notifications${top ? `?top=${top}` : ''}`),
  unreadCount: () => apiFetch('/api/notifications/unread-count'),
  markRead:    (id: string) => apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => apiFetch('/api/notifications/read-all', { method: 'POST' }),
  remove:      (id: string) => apiFetch(`/api/notifications/${id}`, { method: 'DELETE' }),
}

// ── Módulo Helpdesk — Comentarios de ticket ───────────────────────────────────

export const ticketCommentsApi = {
  list:   (ticketId: string)              => apiFetch(`/api/helpdesk/tickets/comments?ticketId=${ticketId}`),
  create: (ticketId: string, text: string) => apiFetch(`/api/helpdesk/tickets/comments/${ticketId}`, { method: 'POST', body: JSON.stringify({ text }) }),
}

// ── Módulo Helpdesk — Reportes ─────────────────────────────────────────────────

function dateRangeQs(extra?: Record<string, string>, from?: string, to?: string) {
  const qs = new URLSearchParams(extra)
  if (from) qs.set('from', from)
  if (to) qs.set('to', to)
  return qs.toString()
}

export const helpdeskReportsApi = {
  volume:        (groupBy: 'Status' | 'Category' | 'Priority', from?: string, to?: string) =>
    apiFetch(`/api/helpdesk/reports/volume?${dateRangeQs({ groupBy }, from, to)}`),
  agentLoad:     (from?: string, to?: string) => apiFetch(`/api/helpdesk/reports/agent-load?${dateRangeQs(undefined, from, to)}`),
  responseTimes: (from?: string, to?: string) => apiFetch(`/api/helpdesk/reports/response-times?${dateRangeQs(undefined, from, to)}`),
  slaCompliance: (from?: string, to?: string) => apiFetch(`/api/helpdesk/reports/sla-compliance?${dateRangeQs(undefined, from, to)}`),
}

// ── Módulo Helpdesk — Adjuntos de ticket ──────────────────────────────────────

export const ticketAttachmentsApi = {
  list:   (ticketId: string)         => apiFetch(`/api/helpdesk/tickets/${ticketId}/attachments`),
  upload: (ticketId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return apiFetch(`/api/helpdesk/tickets/${ticketId}/attachments`, { method: 'POST', body: formData })
  },
  getUrl: (id: string) => apiFetch(`/api/helpdesk/tickets/attachments/${id}/url`),
  remove: (id: string) => apiFetch(`/api/helpdesk/tickets/attachments/${id}`, { method: 'DELETE' }),
}

// ── Módulo Seguridad — Módulos, Roles y Usuarios ─────────────────────────────

interface RolePayload {
  name: string
  description?: string
  moduleIds: string[]
  permissionIds: string[]
}

interface UserCreatePayload {
  names: string
  email: string
  password: string
  roleId: string
  employeeId?: string
}

interface UserUpdatePayload {
  names: string
  email: string
  roleId: string
  employeeId?: string
}

export const modulesApi = {
  list: () => apiFetch('/api/security/modules'),
}

export const permissionsApi = {
  list: (moduleCode?: string) => apiFetch(`/api/security/permissions${moduleCode ? `?moduleCode=${moduleCode}` : ''}`),
}

export const rolesApi = {
  list:     ()                             => apiFetch('/api/security/roles'),
  getById:  (id: string)                   => apiFetch(`/api/security/roles/${id}`),
  create:   (data: RolePayload)            => apiFetch('/api/security/roles',       { method: 'POST',  body: JSON.stringify(data) }),
  update:   (id: string, data: RolePayload) => apiFetch(`/api/security/roles/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  toggle:   (id: string)                   => apiFetch(`/api/security/roles/${id}/toggle`, { method: 'PATCH' }),
  remove:   (id: string)                   => apiFetch(`/api/security/roles/${id}`,        { method: 'DELETE' }),
}

export const usersApi = {
  list:          (roleId?: string)                 => apiFetch(roleId ? `/api/security/users?roleId=${roleId}` : '/api/security/users'),
  create:        (data: UserCreatePayload)         => apiFetch('/api/security/users',       { method: 'POST',  body: JSON.stringify(data) }),
  update:        (id: string, data: UserUpdatePayload) => apiFetch(`/api/security/users/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  toggle:        (id: string)                      => apiFetch(`/api/security/users/${id}/toggle`, { method: 'PATCH' }),
  resetPassword: (id: string, newPassword: string) => apiFetch(`/api/security/users/${id}/reset-password`, { method: 'PATCH', body: JSON.stringify({ newPassword }) }),
  remove:        (id: string)                      => apiFetch(`/api/security/users/${id}`,        { method: 'DELETE' }),
}

// ── Autenticación ─────────────────────────────────────────────────────────────

export const authApi = {
  login: async (email: string, password: string) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Error al iniciar sesión' }))
      throw new Error(err.message)
    }
    const data = await res.json()
    tokenStore.set(data.accessToken)
    localStorage.setItem(REFRESH_KEY, data.refreshToken)
    return data
  },

  logout: async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY)
    if (refreshToken) {
      await apiFetch('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {})
    }
    tokenStore.clear()
    localStorage.removeItem(REFRESH_KEY)
  },

  // Intenta restaurar la sesión al cargar la app usando el refresh token guardado.
  restore: async (): Promise<boolean> => tryRefresh(),

  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) =>
    apiFetch('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    }),

  updateProfile: (names: string, email: string) =>
    apiFetch('/api/auth/me', { method: 'PATCH', body: JSON.stringify({ names, email }) }),
}

// ── Perfil — autoservicio del empleado vinculado al usuario en sesión ───────
// A diferencia de employeesApi (requiere el módulo hr), estos endpoints los
// puede usar cualquier usuario autenticado sobre su propio registro.
export const employeeSelfApi = {
  get:    ()               => apiFetch('/api/employees/me'),
  update: (data: { phone?: string | null; address?: string | null }) =>
    apiFetch('/api/employees/me', { method: 'PATCH', body: JSON.stringify(data) }),
}

// ── Foto de perfil de la CUENTA (independiente de la ficha de empleado) ────
// Cualquier usuario autenticado puede elegir su propia foto aquí, tenga o no
// un empleado vinculado; nunca toca hr.Employees.PhotoUrl (ver EmployeeDirectoryApi
// y employeesApi.photo, que son los únicos que gestionan la ficha).
export const userSelfApi = {
  uploadPhoto: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiFetch('/api/users/me/photo', { method: 'POST', body: fd })
  },
  photoUrl:    () => apiFetch('/api/users/me/photo-url'),
  deletePhoto: () => apiFetch('/api/users/me/photo', { method: 'DELETE' }),
}
