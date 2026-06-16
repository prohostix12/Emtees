import "@/index.css";
import { TRPCProvider } from "@/providers/trpc";
import { AuthProvider } from "@/hooks/useAuth";
import { Toaster } from "sonner";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "EMTEES Academy LMS",
  description: "LMS & Communication Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TRPCProvider>
          <AuthProvider>
            {children}
            <Toaster position="top-right" />
          </AuthProvider>
        </TRPCProvider>
      </body>
    </html>
  );
}
