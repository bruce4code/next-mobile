import type { Metadata } from 'next'
import { ProfilePageClient } from './ProfileClient'

export const metadata: Metadata = {
  title: '个人资料',
  description: '管理您的 AI Chat 个人资料与偏好设置',
}

export default function ProfilePage() {
  return <ProfilePageClient />
}
