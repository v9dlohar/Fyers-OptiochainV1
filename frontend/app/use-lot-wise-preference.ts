"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "optionflow_lot_wise";
const CHANGE_EVENT = "optionflow-lot-wise-change";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function getSnapshot() {
  return window.localStorage.getItem(STORAGE_KEY) !== "false";
}

function getServerSnapshot() {
  return true;
}

export function useLotWisePreference() {
  const lotWise = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setLotWise = useCallback((enabled: boolean) => {
    window.localStorage.setItem(STORAGE_KEY, String(enabled));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return [lotWise, setLotWise] as const;
}
