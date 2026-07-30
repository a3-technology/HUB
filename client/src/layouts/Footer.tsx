export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-6 lg:px-8 h-12 flex items-center transition-colors">
      <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500 w-full">
        <p>{year} © HUB</p>
        <div className="hidden sm:flex items-center gap-4">
          <a href="#" className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors">Soporte</a>
          <a href="#" className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors">Privacidad</a>
          <a href="#" className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors">Términos</a>
          <span className="text-slate-200 dark:text-slate-700">v1.0.0</span>
        </div>
        <span className="sm:hidden text-slate-300 dark:text-slate-700">v1.0.0</span>
      </div>
    </footer>
  )
}
