import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './context/ToastContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { RequireModule } from './components/RequireModule'
import { AppLayout } from './layouts/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { ProfilePage } from './pages/ProfilePage'
import { ResumenPage as HrResumenPage } from './pages/hr/ResumenPage'
import { EmpleadosPage } from './pages/hr/EmpleadosPage'
import { DepartamentosPage } from './pages/hr/DepartamentosPage'
import { CargosPage } from './pages/hr/CargosPage'
import { NominaPage } from './pages/hr/NominaPage'
import { ContratosPage } from './pages/hr/ContratosPage'
import { AsistenciaPage } from './pages/hr/AsistenciaPage'
import { VacacionesPage } from './pages/hr/VacacionesPage'
import { ReclutamientoPage } from './pages/hr/ReclutamientoPage'
import { ReportesPage as HrReportesPage } from './pages/hr/ReportesPage'
import { EmpresasPage } from './pages/crm/EmpresasPage'
import { SucursalesPage } from './pages/crm/SucursalesPage'
import { ContactosPage } from './pages/crm/ContactosPage'
import { OportunidadesPage } from './pages/crm/OportunidadesPage'
import { ActividadesPage } from './pages/crm/ActividadesPage'
import { ReportesPage } from './pages/crm/ReportesPage'
import { UsuariosPage } from './pages/security/UsuariosPage'
import { RolesPage } from './pages/security/RolesPage'
import { ResumenPage } from './pages/projects/ResumenPage'
import { ProyectosPage } from './pages/projects/ProyectosPage'
import { TareasPage } from './pages/projects/TareasPage'
import { CronogramaPage } from './pages/projects/CronogramaPage'
import { ReportesPage as ProjectsReportesPage } from './pages/projects/ReportesPage'
import { ProductosPage } from './pages/ventas/ProductosPage'
import { CotizacionesPage } from './pages/ventas/CotizacionesPage'
import { OrdenesVentaPage } from './pages/ventas/OrdenesVentaPage'
import { ContratosPage as VentasContratosPage } from './pages/ventas/ContratosPage'
import { ReportesPage as VentasReportesPage } from './pages/ventas/ReportesPage'
import { ResumenPage as HelpdeskResumenPage } from './pages/helpdesk/ResumenPage'
import { TicketsPage } from './pages/helpdesk/TicketsPage'
import { CategoriasPage as HelpdeskCategoriasPage } from './pages/helpdesk/CategoriasPage'
import { PrioridadesPage } from './pages/helpdesk/PrioridadesPage'
import { EstadosPage as HelpdeskEstadosPage } from './pages/helpdesk/EstadosPage'
import { ReportesPage as HelpdeskReportesPage } from './pages/helpdesk/ReportesPage'
import { EmpresaPage } from './pages/general/EmpresaPage'

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard"           element={<DashboardPage />}     />
              <Route path="/perfil"              element={<ProfilePage />}       />
              <Route path="/hr/resumen"          element={<RequireModule module="hr" permission="hr.dashboard.view"><HrResumenPage /></RequireModule>}     />
              <Route path="/hr/empleados"        element={<RequireModule module="hr"><EmpleadosPage /></RequireModule>}     />
              <Route path="/hr/departamentos"    element={<RequireModule module="hr"><DepartamentosPage /></RequireModule>} />
              <Route path="/hr/cargos"           element={<RequireModule module="hr"><CargosPage /></RequireModule>}        />
              <Route path="/hr/nomina"           element={<RequireModule module="hr"><NominaPage /></RequireModule>}        />
              <Route path="/hr/contratos"        element={<RequireModule module="hr"><ContratosPage /></RequireModule>}     />
              <Route path="/hr/asistencia"       element={<RequireModule module="hr"><AsistenciaPage /></RequireModule>}    />
              <Route path="/hr/vacaciones"       element={<RequireModule module="hr"><VacacionesPage /></RequireModule>}    />
              <Route path="/hr/reclutamiento"    element={<RequireModule module="hr"><ReclutamientoPage /></RequireModule>} />
              <Route path="/hr/reportes"         element={<RequireModule module="hr" permission="hr.reports.view"><HrReportesPage /></RequireModule>} />
              <Route path="/crm/empresas"        element={<RequireModule module="crm"><EmpresasPage /></RequireModule>}      />
              <Route path="/crm/sucursales"      element={<RequireModule module="crm"><SucursalesPage /></RequireModule>}    />
              <Route path="/crm/contactos"       element={<RequireModule module="crm"><ContactosPage /></RequireModule>}     />
              <Route path="/crm/oportunidades"   element={<RequireModule module="crm"><OportunidadesPage /></RequireModule>} />
              <Route path="/crm/actividades"     element={<RequireModule module="crm"><ActividadesPage /></RequireModule>}   />
              <Route path="/crm/reportes"        element={<RequireModule module="crm"><ReportesPage /></RequireModule>}      />
              <Route path="/security/usuarios"   element={<RequireModule module="security"><UsuariosPage /></RequireModule>} />
              <Route path="/security/roles"      element={<RequireModule module="security"><RolesPage /></RequireModule>}    />
              <Route path="/projects/resumen"    element={<RequireModule module="projects" permission="projects.dashboard.view"><ResumenPage /></RequireModule>}    />
              <Route path="/projects/proyectos"  element={<RequireModule module="projects"><ProyectosPage /></RequireModule>}  />
              <Route path="/projects/tareas"     element={<RequireModule module="projects"><TareasPage /></RequireModule>}     />
              <Route path="/projects/cronograma" element={<RequireModule module="projects"><CronogramaPage /></RequireModule>} />
              <Route path="/projects/reportes"   element={<RequireModule module="projects" permission="projects.reports.view"><ProjectsReportesPage /></RequireModule>} />
              <Route path="/ventas/productos"    element={<RequireModule module="ventas"><ProductosPage /></RequireModule>}      />
              <Route path="/ventas/cotizaciones" element={<RequireModule module="ventas"><CotizacionesPage /></RequireModule>}   />
              <Route path="/ventas/ordenes"      element={<RequireModule module="ventas"><OrdenesVentaPage /></RequireModule>}   />
              <Route path="/ventas/contratos"    element={<RequireModule module="ventas"><VentasContratosPage /></RequireModule>} />
              <Route path="/ventas/reportes"     element={<RequireModule module="ventas"><VentasReportesPage /></RequireModule>}  />
              <Route path="/helpdesk/resumen"     element={<RequireModule module="helpdesk" permission="helpdesk.dashboard.view"><HelpdeskResumenPage /></RequireModule>} />
              <Route path="/helpdesk/tickets"     element={<RequireModule module="helpdesk"><TicketsPage /></RequireModule>}            />
              <Route path="/helpdesk/categorias"  element={<RequireModule module="helpdesk"><HelpdeskCategoriasPage /></RequireModule>} />
              <Route path="/helpdesk/prioridades" element={<RequireModule module="helpdesk"><PrioridadesPage /></RequireModule>}        />
              <Route path="/helpdesk/estados"     element={<RequireModule module="helpdesk"><HelpdeskEstadosPage /></RequireModule>}    />
              <Route path="/helpdesk/reportes"    element={<RequireModule module="helpdesk" permission="helpdesk.reports.view"><HelpdeskReportesPage /></RequireModule>}   />
              <Route path="/general/empresa"      element={<RequireModule module="security"><EmpresaPage /></RequireModule>}    />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  )
}

export default App
