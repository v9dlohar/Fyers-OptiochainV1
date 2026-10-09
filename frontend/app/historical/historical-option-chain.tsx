"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "../option-chain.module.css";
import { useLotWisePreference } from "../use-lot-wise-preference";

type ApiRequest = (path: string, options?: RequestInit) => Promise<unknown>;
type HistoricalLeg = {
  symbol: string;
  close: number;
  volume: number;
  open_interest: number | null;
  oi_change: number | null;
} | null;

type HistoricalRow = {
  strike: string;
  call: HistoricalLeg;
  put: HistoricalLeg;
};
type Metric = "volume" | "open_interest" | "oi_change";
type MetricScale = { maximum: number; top: string | null; second: string | null };
type SideScales = Record<Metric, MetricScale>;
type ShareScales = { call: SideScales; put: SideScales };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatValue(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "—"
    : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
}

function formatShare(value: number | null, maximum: number, signedShare = false): string {
  if (value === null) return "—";
  const magnitude = signedShare ? Math.abs(value) : Math.max(value, 0);
  if (maximum <= 0) return magnitude === 0 ? (signedShare ? "0.00%" : "0%") : "—";
  const percentage = (magnitude / maximum) * 100;
  const shown = signedShare && value < 0 ? -percentage : percentage;
  return `${signedShare && shown > 0 ? "+" : ""}${shown.toFixed(2).replace(/\.?0+$/, "")}%`;
}

function shareClass(
  leg: HistoricalLeg,
  value: number | null,
  scale: { maximum: number; top: string | null; second: string | null },
): string {
  if (!leg || value === null) return "";
  if (leg.symbol === scale.top) return styles.topShare;
  if (leg.symbol === scale.second) return styles.secondShare;
  return "";
}

function metricScale(legs: HistoricalLeg[], metric: Metric): MetricScale {
  const sorted = legs
    .filter(
      (leg): leg is NonNullable<HistoricalLeg> =>
        leg !== null && leg[metric] !== null,
    )
    .sort((left, right) => {
      const leftValue = left[metric] ?? 0;
      const rightValue = right[metric] ?? 0;
      return (
        Math.abs(rightValue) - Math.abs(leftValue) ||
        left.symbol.localeCompare(right.symbol)
      );
    });
  return {
    maximum: Math.abs(sorted[0]?.[metric] ?? 0),
    top: sorted[0]?.symbol ?? null,
    second: sorted[1]?.symbol ?? null,
  };
}

function renderLeg(
  leg: HistoricalLeg,
  type: "CE" | "PE",
  scales: SideScales,
  lotWise: boolean,
  lotSizes: Record<string, number | null>,
) {
  const scale = (metric: "volume" | "open_interest" | "oi_change") =>
    scales[metric];
  const quantityCell = (
    value: number | null,
    metric: "volume" | "open_interest" | "oi_change",
    signedShare = false,
  ) => {
    const metricScale = scale(metric);
    const cssClass = shareClass(leg, value, metricScale);
    const lotSize = leg ? lotSizes[leg.symbol] ?? null : null;
    const displayedValue = value === null
      ? "—"
      : lotWise && lotSize !== null
        ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value / lotSize)
        : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 }).format(value);
    const lotDescription = !lotWise
      ? ""
      : lotSize
        ? ` · ${lotSize.toLocaleString("en-IN")} units per lot`
        : " · Lot size unavailable; value shown in units";
    return (
      <td
        key={metric}
        title={`${metric === "volume" ? "Volume" : metric === "open_interest" ? "Open interest" : "OI change"}: ${value === null ? "—" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 }).format(value)}${lotDescription}`}
        className={metric === "oi_change" ? (value ?? 0) > 0 ? styles.positive : (value ?? 0) < 0 ? styles.negative : "" : undefined}
      >
        <span className={`${styles.valueWithShare} ${cssClass}`}>
          <span>{displayedValue}</span>
          <small className={styles.shareBadge}>{formatShare(value, metricScale.maximum, signedShare)}</small>
        </span>
      </td>
    );
  };
  const callValues = (
    <>
      {quantityCell(leg?.oi_change ?? null, "oi_change", true)}
      {quantityCell(leg?.open_interest ?? null, "open_interest")}
      {quantityCell(leg?.volume ?? null, "volume")}
      <td className={type === "CE" ? styles.callLtp : styles.putLtp}>
        {leg ? formatValue(leg.close) : "—"}
      </td>
    </>
  );
  return (
    type === "CE"
      ? callValues
      : <>
          <td className={styles.putLtp}>{leg ? formatValue(leg.close) : "—"}</td>
          {quantityCell(leg?.volume ?? null, "volume")}
          {quantityCell(leg?.open_interest ?? null, "open_interest")}
          {quantityCell(leg?.oi_change ?? null, "oi_change", true)}
        </>
  );
}

export default function HistoricalOptionChain({
  apiRequest,
  underlying,
  underlyingSymbol,
  expiry,
  timestamp,
  rows,
  spot,
}: {
  apiRequest: ApiRequest;
  underlying: string;
  underlyingSymbol: string;
  expiry: string;
  timestamp: number | null;
  rows: HistoricalRow[];
  spot: number | null;
}) {
  const [spotLineTop, setSpotLineTop] = useState<number | null>(null);
  const [lotWise, setLotWise] = useLotWisePreference();
  const [lotSizes, setLotSizes] = useState<Record<string, number | null>>({});
  const [loadingLotSizes, setLoadingLotSizes] = useState(false);
  const [lotSizeError, setLotSizeError] = useState("");
  const tableViewportRef = useRef<HTMLDivElement>(null);
  const strikeRowsRef = useRef(new Map<string, HTMLTableRowElement>());
  const lotSizeRequestVersion = useRef(0);
  const lotSizesForSymbols = useRef("");
  const lotSymbolsKey = useMemo(
    () => [...new Set(rows.flatMap((row) => [row.call?.symbol, row.put?.symbol].filter(
      (symbol): symbol is string => Boolean(symbol),
    )))].join(","),
    [rows],
  );
  const loadLotSizes = useCallback(async (symbolsKey: string) => {
    const symbols = symbolsKey.split(",");
    const version = ++lotSizeRequestVersion.current;
    setLoadingLotSizes(true);
    setLotSizeError("");
    try {
      const value = await apiRequest("/api/admin/fyers/option-chain/lot-sizes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(symbols),
      });
      if (!isRecord(value) || !isRecord(value.lot_sizes)) {
        throw new Error("The instrument master returned an invalid lot-size response.");
      }
      const nextSizes: Record<string, number | null> = {};
      for (const symbol of symbols) {
        const lotSize = value.lot_sizes[symbol];
        if (lotSize !== null && (typeof lotSize !== "number" || !Number.isFinite(lotSize) || lotSize <= 0)) {
          throw new Error(`The instrument master returned an invalid lot size for ${symbol}.`);
        }
        nextSizes[symbol] = lotSize;
      }
      if (version !== lotSizeRequestVersion.current) return;
      let fallbackNotice = "";
      if (Object.values(nextSizes).some((lotSize) => lotSize === null)) {
        try {
          const liveChain = await apiRequest(
            `/api/admin/fyers/option-chain?${new URLSearchParams({ symbol: underlyingSymbol })}`,
          );
          if (!isRecord(liveChain) || !Array.isArray(liveChain.options)) {
            throw new Error("The current option chain returned an invalid contract list.");
          }
          const liveSymbols = [...new Set(liveChain.options.flatMap((item) =>
            isRecord(item) && typeof item.symbol === "string" ? [item.symbol] : [],
          ))];
          if (liveSymbols.length === 0) {
            throw new Error("The current option chain contains no contracts for lot-size lookup.");
          }
          const liveLots = await apiRequest("/api/admin/fyers/option-chain/lot-sizes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(liveSymbols),
          });
          if (!isRecord(liveLots) || !isRecord(liveLots.lot_sizes)) {
            throw new Error("The current instrument master returned an invalid lot-size response.");
          }
          const currentLotSizes = new Set(
            Object.values(liveLots.lot_sizes).filter(
              (lotSize): lotSize is number =>
                typeof lotSize === "number" && Number.isSafeInteger(lotSize) && lotSize > 0,
            ),
          );
          if (currentLotSizes.size === 1) {
            const currentLotSize = currentLotSizes.values().next().value;
            if (currentLotSize !== undefined) {
              for (const symbol of symbols) {
                if (nextSizes[symbol] === null) nextSizes[symbol] = currentLotSize;
              }
            }
          }
        } catch (caught) {
          fallbackNotice = caught instanceof Error
            ? ` Current lot-size lookup failed: ${caught.message}`
            : " Current lot-size lookup failed.";
        }
      }
      if (version !== lotSizeRequestVersion.current) return;
      setLotSizes(nextSizes);
      lotSizesForSymbols.current = symbolsKey;
      const missingCount = Object.values(nextSizes).filter((lotSize) => lotSize === null).length;
      setLotSizeError(missingCount > 0
        ? `Lot sizes remain unavailable for ${missingCount} contracts; their values are shown in units.${fallbackNotice}`
        : "");
    } catch (caught) {
      if (version === lotSizeRequestVersion.current) {
        setLotSizeError(
          caught instanceof Error ? caught.message : "Unable to load contract lot sizes.",
        );
      }
    } finally {
      if (version === lotSizeRequestVersion.current) setLoadingLotSizes(false);
    }
  }, [apiRequest, underlyingSymbol]);
  function toggleLotWise() {
    if (lotWise) {
      setLotWise(false);
      return;
    }
    setLotWise(true);
    if (lotSymbolsKey && lotSizesForSymbols.current !== lotSymbolsKey) {
      void loadLotSizes(lotSymbolsKey);
    }
  }
  useEffect(() => {
    if (lotWise && lotSymbolsKey && lotSizesForSymbols.current !== lotSymbolsKey) {
      void loadLotSizes(lotSymbolsKey);
    }
  }, [loadLotSizes, lotSymbolsKey, lotWise]);
  const shareScales: ShareScales = {
    call: {
      volume: metricScale(rows.map((row) => row.call), "volume"),
      open_interest: metricScale(rows.map((row) => row.call), "open_interest"),
      oi_change: metricScale(rows.map((row) => row.call), "oi_change"),
    },
    put: {
      volume: metricScale(rows.map((row) => row.put), "volume"),
      open_interest: metricScale(rows.map((row) => row.put), "open_interest"),
      oi_change: metricScale(rows.map((row) => row.put), "oi_change"),
    },
  };
  const missingCandleLegs = rows.reduce(
    (count, row) => count + Number(row.call === null) + Number(row.put === null),
    0,
  );
  const atmStrike = spot === null || rows.length === 0
    ? null
    : rows.reduce((nearest, row) =>
        Math.abs(Number(row.strike) - spot) < Math.abs(Number(nearest.strike) - spot)
          ? row
          : nearest,
      ).strike;

  const updateSpotLinePosition = useCallback(() => {
    const viewport = tableViewportRef.current;
    if (spot === null || !viewport || rows.length === 0) {
      setSpotLineTop(null);
      return;
    }
    const viewportBounds = viewport.getBoundingClientRect();
    const centerOf = (strike: string): number | null => {
      const element = strikeRowsRef.current.get(strike);
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return bounds.top - viewportBounds.top + viewport.scrollTop -
        viewport.clientTop + bounds.height / 2;
    };
    const firstStrike = Number(rows[0].strike);
    const lastStrike = Number(rows[rows.length - 1].strike);
    if (spot < firstStrike) {
      setSpotLineTop(centerOf(rows[0].strike));
      return;
    }
    if (spot > lastStrike) {
      setSpotLineTop(centerOf(rows[rows.length - 1].strike));
      return;
    }
    const upperIndex = rows.findIndex((row) => Number(row.strike) >= spot);
    if (upperIndex < 0) {
      setSpotLineTop(null);
      return;
    }
    const upperRow = rows[upperIndex];
    const upperCenter = centerOf(upperRow.strike);
    if (upperCenter === null) {
      setSpotLineTop(null);
      return;
    }
    if (Number(upperRow.strike) === spot || upperIndex === 0) {
      setSpotLineTop(upperCenter);
      return;
    }
    const lowerRow = rows[upperIndex - 1];
    const lowerCenter = centerOf(lowerRow.strike);
    const lowerStrike = Number(lowerRow.strike);
    const upperStrike = Number(upperRow.strike);
    if (lowerCenter === null || upperStrike === lowerStrike) {
      setSpotLineTop(null);
      return;
    }
    const fraction = (spot - lowerStrike) / (upperStrike - lowerStrike);
    setSpotLineTop(lowerCenter + (upperCenter - lowerCenter) * fraction);
  }, [rows, spot]);

  useEffect(() => {
    const viewport = tableViewportRef.current;
    if (!viewport) return;
    const frame = window.requestAnimationFrame(updateSpotLinePosition);
    const observer = new ResizeObserver(updateSpotLinePosition);
    observer.observe(viewport);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [updateSpotLinePosition]);

  return (
    <div className={styles.workspace} aria-label="Historical option chain">
    <section className={styles.chainPanel} aria-label="Historical option chain data">
      <div className={styles.tableHeader}>
        <div>
          <h3>{underlying} historical option chain</h3>
          <span>
            {expiry} · {timestamp === null ? "No candle selected" : new Intl.DateTimeFormat("en-IN", {
              timeZone: "Asia/Kolkata",
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(timestamp * 1000))}
          </span>
        </div>
        <div className={styles.tableActions}>
          <span className={styles.strikeCount}>{rows.length} strikes shown</span>
          <button
            type="button"
            className={styles.lotModeButton}
            aria-pressed={lotWise}
            disabled={rows.length === 0 || loadingLotSizes}
            title="Show Volume, OI and OI change in lots using each option contract's lot size"
            onClick={toggleLotWise}
          >
            <span>{loadingLotSizes ? "Loading…" : lotWise ? "Lot-wise" : "Units"}</span>
            <span className={styles.lotSwitch} aria-hidden="true" />
          </button>
        </div>
      </div>
      {lotSizeError && <p className={styles.lotSizeNotice} role="status">{lotSizeError}</p>}
      {missingCandleLegs > 0 && (
        <p className={styles.lotSizeNotice} role="status">
          {missingCandleLegs} call/put cells have no historical candle at or before this replay time.
          Dashes indicate unavailable data, not zero; open interest may also be absent from provider candles.
        </p>
      )}
      <div className={styles.scrollHint}>
        {spot !== null && (
          <span className={styles.spotLegend}>
            <i /> Historical underlying close {formatValue(spot)}
          </span>
        )}
      </div>
      <div
        ref={tableViewportRef}
        className={styles.tableViewport}
        role="region"
        aria-label="Historical option chain by replay timestamp"
        tabIndex={0}
        onScroll={updateSpotLinePosition}
      >
        {spotLineTop !== null && spot !== null && (
          <div className={styles.spotPriceLine} style={{ top: spotLineTop }}>
            <span>{`SPOT ${formatValue(spot)}`}</span>
          </div>
        )}
        <table className={styles.chainTable}>
          <thead>
            <tr className={styles.groupHeader}>
              <th className={styles.callGroupHeader} colSpan={4}>CALLS <small>CE</small></th>
              <th rowSpan={2} className={styles.strikeHeader}>STRIKE</th>
              <th className={styles.putGroupHeader} colSpan={4}>PUTS <small>PE</small></th>
            </tr>
            <tr className={styles.columnHeader}>
              {["OI Δ", "OI", "Volume", "LTP"].map((label) => (
                <th className={styles.callColumnHeader} key={`call-${label}`}>{label}</th>
              ))}
              {["LTP", "Volume", "OI", "OI Δ"].map((label) => (
                <th className={styles.putColumnHeader} key={`put-${label}`}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.strike}
                className={row.strike === atmStrike ? styles.atmRow : undefined}
                ref={(element) => {
                  if (element) strikeRowsRef.current.set(row.strike, element);
                  else strikeRowsRef.current.delete(row.strike);
                }}
              >
                {renderLeg(row.call, "CE", shareScales.call, lotWise, lotSizes)}
                <td className={styles.strikeCell}>{formatValue(Number(row.strike))}</td>
                {renderLeg(row.put, "PE", shareScales.put, lotWise, lotSizes)}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className={styles.emptyState}>No historical contracts are available in this range.</div>
        )}
      </div>
    </section>
    </div>
  );
}
