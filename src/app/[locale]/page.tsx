import { redirect } from 'next/navigation'
// 在 Next.js 14+ App Router 里，params 可能是一个异步的 Promise，必须先 await 再用
export default async function LocaleHome({ params }: { params: { locale: string } }) {
  const { locale } = await params;
  redirect(`/${locale}/login`)
}