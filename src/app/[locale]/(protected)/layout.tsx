// app/(protected)/layout.tsx (Protected Routes Layout)
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AppSidebar } from "@/components/AppSidebar"

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
    <div className="chatgpt-container">
      <AppSidebar />
      <div className="chatgpt-main">
        {children}
      </div>
    </div>
  )
}