// app/(protected)/layout.tsx (Protected Routes Layout)
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/AppSidebar"
import { Navbar } from "@/components/Navbar"

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // const cookieStore = cookies()
  // const token = cookieStore.get('token')?.value
  // console.log('token-->',token)

  // if (!token) {
  //   redirect('/login')
  // }

  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="w-full h-screen flex flex-col">
        <Navbar />
        <SidebarTrigger />
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </SidebarProvider>
  )
}