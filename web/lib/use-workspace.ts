"use client";
import { useEffect, useState } from "react";
import { fixtureData, loadWorkspace, useFixtures, type WorkspaceData } from "./data";
export function useWorkspace() {
  const [data, setData] = useState<WorkspaceData | null>(useFixtures ? fixtureData : null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    loadWorkspace(controller.signal).then(setData).catch(error => {
      if (error.name !== "AbortError") setError(error.message);
    });
    return () => controller.abort();
  }, [revision]);
  return { data, error, reload: () => setRevision(n => n + 1), useFixtures };
}
