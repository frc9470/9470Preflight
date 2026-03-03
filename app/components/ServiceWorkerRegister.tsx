"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister(): null {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Silent: app still works without service worker.
    });
  }, []);

  return null;
}
