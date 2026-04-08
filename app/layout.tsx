import type { Metadata } from "next";
// import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Fonts disabled for offline build — use system fonts instead
// const inter = Inter({
//   variable: "--font-inter",
//   subsets: ["latin"],
//   weight: ["300", "400", "500", "600", "700"],
// });

// const spaceGrotesk = Space_Grotesk({
//   variable: "--font-space-grotesk",
//   subsets: ["latin"],
//   weight: ["400", "500", "600", "700"],
// });

// const jetbrainsMono = JetBrains_Mono({
//   variable: "--font-jetbrains",
//   subsets: ["latin"],
//   weight: ["400", "500"],
// });

export const metadata: Metadata = {
  title: "Directive CRM",
  description: "AI-powered roofing sales intelligence",
  icons: {
    icon: "/directive-icon.png",
    apple: "/directive-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className="font-sans antialiased bg-dark text-white"
      >
        {children}
      </body>
    </html>
  );
}
