import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/en/chat') // 或根据浏览器语言动态选择
}