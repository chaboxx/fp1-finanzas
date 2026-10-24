import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeRuntime } from "@/components/theme-runtime";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Finanzas",
  description: "Mis finanzas personales",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var p=localStorage.getItem('finanzas:theme')||'light';document.documentElement.classList.toggle('dark',p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches));document.documentElement.dataset.theme=p}catch(e){}",
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeRuntime />
        {children}
      </body>
    </html>
  );
}
