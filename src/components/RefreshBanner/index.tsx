import { useEffect, useRef, useState } from "react";
import { useIsFetching } from "@tanstack/react-query";
import styles from "./RefreshBanner.module.css";

type BannerStatus = "hidden" | "fetching" | "done";

/**
 * Only shows during the initial app-load refresh cycle.
 * Once that first fetch round completes, it retires permanently
 * so page navigations never trigger it again.
 */
export function RefreshBanner() {
  const isFetching = useIsFetching({});
  const [status, setStatus] = useState<BannerStatus>("hidden");
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wasFetchingRef = useRef(false);
  const retiredRef = useRef(false);

  useEffect(() => {
    if (retiredRef.current) return;

    if (isFetching > 0) {
      wasFetchingRef.current = true;
      clearTimeout(hideTimerRef.current);
      setStatus("fetching");
    } else if (wasFetchingRef.current) {
      setStatus("done");
      hideTimerRef.current = setTimeout(() => {
        setStatus("hidden");
        retiredRef.current = true;
      }, 1500);
    }

    return () => clearTimeout(hideTimerRef.current);
  }, [isFetching]);

  if (status === "hidden") return null;

  return (
    <div className={styles.banner} data-status={status} role="status">
      {status === "fetching" && (
        <>
          <div className={styles.spinner} />
          <span>Updating…</span>
          <div className={styles.progressBar} />
        </>
      )}
      {status === "done" && <span>Up to date ✓</span>}
    </div>
  );
}
