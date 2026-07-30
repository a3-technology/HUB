import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { Footer } from './Footer'
import { ScrollToTop } from '../components/ScrollToTop'
import { SupportPanelProvider } from '../context/SupportPanelContext'

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <SupportPanelProvider>
      <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors">
        {/* Overlay móvil */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex-1 flex flex-col min-h-screen min-w-0 overflow-x-hidden">
          <Topbar onMenuClick={() => setSidebarOpen(true)} />
          <main className="flex-1 pt-14">
            <Outlet />
          </main>
          <Footer />
        </div>

        <ScrollToTop />
      </div>
    </SupportPanelProvider>
  )
}
