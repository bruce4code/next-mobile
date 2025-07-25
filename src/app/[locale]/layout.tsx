import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { Toaster } from "sonner"
import { WebVitals } from "@/components/WebVitals"
import I18nProviderWrapper from "@/components/I18nProviderWrapper"
import { UserProvider } from "@/components/UserProvider"
import { getTranslation } from "@/lib/i18n.server"

// 移除以下两行导入
// import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
// import { AppSidebar } from "@/components/AppSidebar"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Create Next App",
  description: "Generated by create next app",
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string }> // Update type to Promise
}>) {
  const resolvedParams = await params; // Await params here
  console.log('RootLayout: params.locale =', resolvedParams.locale);
  // Re-enable getTranslation and related code
  const { serializedResources } = await getTranslation(resolvedParams.locale, "common");
  console.log('RootLayout: serializedResources =', serializedResources);

  // 如果 i18n 实例需要根据 locale 动态改变语言，可以在这里处理
  // useEffect(() => {
  //   if (resolvedParams.locale && i18n.language !== resolvedParams.locale) {
  //     i18n.changeLanguage(resolvedParams.locale);
  //   }
  // }, [resolvedParams.locale]);
  // 注意：上面的 useEffect 逻辑更适合放在 I18nProviderWrapper 内部，因为它是一个客户端组件
  return (
    <html lang={resolvedParams.locale}>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased `}>
        {/* Re-enable I18nProviderWrapper */}
        <I18nProviderWrapper locale={resolvedParams.locale} initialResources={serializedResources}> 
          <UserProvider>
            {children}
          </UserProvider>
        </I18nProviderWrapper>
        <WebVitals />
        <Toaster />
      </body>
    </html>
  )
}
