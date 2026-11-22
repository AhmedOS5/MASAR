"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import RequestsFilter from "./_components/RequestsFilter";
import RequestsTable from "./_components/RequestsTable";
import CreateRequestModal from "@/features/requests/CreateRequestModal";
import { ErrorBanner } from "@/components/ui/QueryState";
import useDebounce from "@/hooks/useDebounce";
import { listRequests } from "@/services/requests.service";
import styles from "../dashboard.module.css";

const PER_PAGE = 10;

function RequestsContent() {
  const router = useRouter();
  const sp = useSearchParams();

  const [filters, setFilters] = useState({
    status: sp.get("status") || "all",
    priority: "all",
    search: sp.get("search") || "",
  });
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(sp.get("new") === "1");
  const search = useDebounce(filters.search);

  const params = { status: filters.status, priority: filters.priority, search, page, per_page: PER_PAGE };
  const query = useQuery({
    queryKey: ["requests", params],
    queryFn: () => listRequests(params),
    placeholderData: keepPreviousData,
  });

  const change = (patch) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    if (sp.get("new")) router.replace("/dashboard/requests");
  };

  return (
    <main className={`${styles.mainContainer} ${styles.fadeInAnimation}`}>
      <RequestsFilter
        filters={filters}
        onChange={change}
        counts={query.data?.meta?.status_counts}
        onCreate={() => setCreateOpen(true)}
      />
      {query.isError && !query.data ? (
        <ErrorBanner error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <RequestsTable query={query} page={page} onPageChange={setPage} perPage={PER_PAGE} />
      )}
      <CreateRequestModal open={createOpen} onClose={closeCreate} />
    </main>
  );
}

export default function RequestsPage() {
  return (
    <Suspense fallback={null}>
      <RequestsContent />
    </Suspense>
  );
}
