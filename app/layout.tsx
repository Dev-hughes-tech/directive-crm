import type { Metadata } from "next";
import "./globals.css";

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
