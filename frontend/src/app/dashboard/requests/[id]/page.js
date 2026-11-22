"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { RequestSummary } from "./_components/RequestSummary";
import { RequestActions } from "./_components/RequestActions";
import { RequestSidebarDetails } from "./_components/RequestSidebarDetails";
import { RequestComments } from "./_components/RequestComments";
import { RequestAttachments } from "./_components/RequestAttachments";
import QueryState from "@/components/ui/QueryState";
import { getRequest } from "@/services/requests.service";
import styles from "./requestDetail.module.css";
import dashboardStyles from "../../dashboard.module.css";

export default function RequestDetailPage({ params }) {
  const { id: requestId } = React.use(params);
  const query = useQuery({
    queryKey: ["request", requestId],
    queryFn: () => getRequest(requestId),
  });

  return (
    <main className={`${dashboardStyles.mainContainer} ${styles.mainContainer} ${styles.fadeInAnimation}`}>
      <div className={styles.backHeader}>
        <Link href="/dashboard/requests" className={styles.backLink}>
          <span>العودة إلى الطلبات</span>
          <ChevronLeft size={16} />
        </Link>
      </div>

      <QueryState query={query} rows={6} block>
        {(request) => (
          <div className={styles.detailLayout}>
            <div className={styles.contentColumn}>
              <RequestSummary request={request} />
              <RequestComments request={request} />
              <RequestAttachments request={request} />
            </div>
            <div className={styles.sidebarColumn}>
              <RequestActions request={request} />
              <RequestSidebarDetails request={request} />
            </div>
          </div>
        )}
      </QueryState>
    </main>
  );
}
