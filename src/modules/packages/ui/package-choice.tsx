"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { EligiblePackage } from "../application/queries";
import type { PackagesActions } from "./packages-actions";

const NONE = "none";

// "Usar pacote" in the booking and edit forms (PRD F10 Experience): the packages of the patient that
// fit the service and the date, with the remaining sessions. When exactly one fits it comes selected;
// in a series, a line says how many sessions the package covers.
export function PackageChoice({
  patientId,
  serviceId,
  date,
  value,
  onChange,
  currentPackageId,
  seriesCount,
  actions,
}: {
  patientId: string;
  serviceId: string;
  date: string;
  value: string | null;
  onChange: (packageId: string | null) => void;
  currentPackageId?: string | null | undefined;
  seriesCount?: number | null | undefined;
  actions: Pick<PackagesActions, "eligible" | "coverage">;
}) {
  const t = useTranslations("packages.ui");
  const [options, setOptions] = useState<EligiblePackage[] | null>(null);
  const [coverage, setCoverage] = useState<{ covered: number; rest: number } | null>(null);
  const preselected = useRef("");
  const key = `${patientId}|${serviceId}|${date}`;

  useEffect(() => {
    let active = true;
    void actions.eligible({ patientId, serviceId, date }).then((result) => {
      if (!active) return;
      const list = result.ok ? result.data : [];
      setOptions(list);
      // Exactly one package fits and none is chosen yet: it comes selected (once per combination).
      const only = list[0];
      if (list.length === 1 && only && preselected.current !== key && value === null && !currentPackageId) {
        preselected.current = key;
        onChange(only.id);
      }
    });
    return () => {
      active = false;
    };
    // The choice is recomputed only when the patient, the service or the date change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, patientId, serviceId, date]);

  useEffect(() => {
    if (!value || !seriesCount) return;
    let active = true;
    void actions.coverage({ packageId: value, count: seriesCount }).then((result) => {
      if (active) setCoverage(result.ok ? result.data : null);
    });
    return () => {
      active = false;
    };
  }, [actions, value, seriesCount]);

  // A coverage read for an earlier choice is not shown once the choice or the series changed.
  const shownCoverage = value && seriesCount ? coverage : null;
  const list = [...(options ?? [])];
  if (currentPackageId && !list.some((item) => item.id === currentPackageId)) {
    list.unshift({
      id: currentPackageId,
      name: t("currentPackage"),
      freeSessions: 0,
      totalSessions: 0,
      expiresOn: "",
    });
  }
  if (list.length === 0) return null;

  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-semibold">{t("choiceTitle")}</legend>
      {list.map((item) => (
        <label key={item.id} className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="package-choice"
            checked={value === item.id}
            onChange={() => onChange(item.id)}
          />
          {item.totalSessions > 0
            ? t("choiceUse", {
                remaining: item.freeSessions + (item.id === currentPackageId ? 1 : 0),
                total: item.totalSessions,
              })
            : item.name}
        </label>
      ))}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          name="package-choice"
          value={NONE}
          checked={value === null}
          onChange={() => onChange(null)}
        />
        {t("choiceNone")}
      </label>
      {shownCoverage && shownCoverage.rest > 0 ? (
        <p className="text-warning text-sm">
          {t("seriesCoverage", {
            covered: shownCoverage.covered,
            count: shownCoverage.covered + shownCoverage.rest,
            rest: shownCoverage.rest,
          })}
        </p>
      ) : null}
    </fieldset>
  );
}
