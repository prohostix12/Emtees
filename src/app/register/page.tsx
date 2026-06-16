"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function RegisterPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace(
          "/login?reason=Self-registration+is+disabled.+Please+contact+an+administrator+to+create+an+account."
        );
      } else {
        const isAdmin = ["super_admin", "admin", "academic_head"].includes(user.role);
        if (isAdmin) {
          router.replace("/users");
        } else {
          router.replace("/?reason=You+do+not+have+permission+to+access+the+registration+page.");
        }
      }
    }
  }, [user, isLoading, router]);

  return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
}
