"use client";
import { useEffect, useState } from "react";
import fixture from "../../contracts/fixtures/lineage.json";
import type { ExposureLineage } from "./contracts";
import { apiRequest, useFixtures } from "./data";
export function useLineage(changeId: string, workspace: unknown) {
  const [data, setData] = useState<ExposureLineage | null>(useFixtures ? fixture as ExposureLineage : null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (useFixtures) return;
    const controller = new AbortController();
    setData(null);
    setError("");
    apiRequest<ExposureLineage>(`/changes/${encodeURIComponent(changeId)}/lineage`, { signal: controller.signal })
      .then(setData).catch(error => { if (error.name !== "AbortError") setError(error.message); });
    return () => controller.abort();
  }, [changeId, workspace]);
  return { data, error };
}
