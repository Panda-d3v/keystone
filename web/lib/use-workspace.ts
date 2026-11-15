"use client";
import { useEffect, useState } from "react";
import { fixtureData, loadWorkspace, useFixtures, type WorkspaceData } from "./data";
export function useWorkspace() {
  const [data, setData] = useState<WorkspaceData | null>(useFixtures ? fixtureData : null);
  const [loading, setLoading] = useState(!useFixtures);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setLoading(true);
    loadWorkspace(controller.signal).then(result => {
      if (!controller.signal.aborted) setData(result);
    }).catch(error => {
      if (!controller.signal.aborted) setError(error.message);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [revision]);
  return { data, error, loading, reload: () => setRevision(n => n + 1), useFixtures };
}
