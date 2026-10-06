"use client";

import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import { adjacencyGraphs, dictionary } from "@zxcvbn-ts/language-common";
import { useTranslations } from "next-intl";
import { forwardRef, useMemo, type ComponentProps } from "react";
import { Input } from "@/shared/ui/components/input";

// Password input with a strength meter (feedback only; the enforced rule is the password policy).
const LEVELS = ["veryWeak", "weak", "fair", "good", "strong"] as const;
const COLORS = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-lime-500", "bg-green-600"] as const;

let factory: ZxcvbnFactory | undefined;
function strength(password: string): number {
  factory ??= new ZxcvbnFactory({ dictionary: { ...dictionary }, graphs: adjacencyGraphs });
  return factory.check(password).score;
}

export const PasswordStrength = ({ value }: { value: string }) => {
  const t = useTranslations("identity.auth.strength");
  const score = useMemo(() => (value ? strength(value) : -1), [value]);
  if (score < 0) return null;
  return (
    <div className="grid gap-1" aria-live="polite">
      <div className="flex gap-1">
        {LEVELS.map((level, index) => (
          <span key={level} className={`h-1 flex-1 rounded ${index <= score ? COLORS[score] : "bg-muted"}`} />
        ))}
      </div>
      <span className="text-muted-foreground text-xs">
        {t("label", { level: t(LEVELS[score] ?? "veryWeak") })}
      </span>
    </div>
  );
};

export const PasswordInput = forwardRef<HTMLInputElement, ComponentProps<typeof Input>>(
  function PasswordInput(props, ref) {
    return <Input ref={ref} type="password" autoComplete="new-password" {...props} />;
  },
);
