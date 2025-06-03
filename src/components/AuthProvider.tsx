import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { usePathname } from 'next/navigation'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const token = cookies().get('token')?.value
  const pathname = usePathname()
  
  if (!token && pathname !== '/login') {
    redirect('/login')
  }
  
  return <>{children}</>
}