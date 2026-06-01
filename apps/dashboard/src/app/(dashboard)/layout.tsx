import AppNav from '@/components/AppNav'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <AppNav />
      <main className="flex-1">{children}</main>
    </div>
  )
}
