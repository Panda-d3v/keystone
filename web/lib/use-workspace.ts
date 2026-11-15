"use client";
import { useEffect, useMemo, useState } from "react";
import {
  fixtureData,
  loadWorkspace,
  useFixtures,
  type WorkspaceData,
} from "./data";
import { useDeclines } from "./submissions";
export function useWorkspace() {
  const [data, setData] = useState<WorkspaceData | null>(
    useFixtures ? fixtureData : null,
  );
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    loadWorkspace(controller.signal)
      .then(setData)
      .catch((error) => {
        if (error.name !== "AbortError") setError(error.message);
      });
    return () => controller.abort();
  }, [revision]);
  const declines = useDeclines(data?.audit);
  const visibleData = useMemo(
    () =>
      data && useFixtures
        ? {
            ...data,
            actions: data.actions.filter(
              (action) =>
                !declines.some((item) => item.action_id === action.id),
            ),
          }
        : data,
    [data, declines],
  );
  return {
    data: visibleData,
    error,
    reload: () => setRevision((n) => n + 1),
    useFixtures,
  };
}
