"use client";

import { Suspense } from "react";
import Settings from "@/pages/Settings";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading settings...</div>}>
      <Settings />
    </Suspense>
  );
}
