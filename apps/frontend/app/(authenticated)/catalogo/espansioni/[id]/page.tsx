"use client";

import { Suspense } from "react";
import ExpansionDetailPage from "./ExpansionDetailClient";
import { PageContainer } from "@/components/PageContainer";
import { Skeleton } from "@/components/ui/Skeleton";
import { CardSkeleton } from "@/components/Card";

function ExpansionDetailFallback() {
  return (
    <PageContainer className="gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <Skeleton className="h-20 w-40" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </PageContainer>
  );
}

export default function ExpansionDetailRoute() {
  return (
    <Suspense fallback={<ExpansionDetailFallback />}>
      <ExpansionDetailPage />
    </Suspense>
  );
}
