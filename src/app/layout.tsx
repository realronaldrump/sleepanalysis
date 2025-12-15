import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Sleep Analysis | Medication-Sleep Correlation Dashboard",
    description: "Statistical analysis of medication effects on sleep quality using Oura Ring data",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className="dark">
            <body className="min-h-screen bg-[#0d0d0d] antialiased">
                <nav className="sticky top-0 z-50 backdrop-blur-lg bg-[#0d0d0d]/80 border-b border-[#262626]">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex justify-between h-16 items-center">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-sky-600 flex items-center justify-center" style={{ boxShadow: '3px 3px 6px #080808, -3px -3px 6px #1a1a1a' }}>
                                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                                    </svg>
                                </div>
                                <span className="text-lg font-bold tracking-tight">Sleep Analysis</span>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-sm text-neutral-400">Statistical Insights Dashboard</span>
                            </div>
                        </div>
                    </div>
                </nav>
                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    {children}
                </main>
            </body>
        </html>
    );
}
