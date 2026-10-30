"use client";

import { ErrorFallback } from "@/components/shared/error-fallback";

export default function DashboardError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorFallback {...props} />;
}
