import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/shared/ui/components/alert";
import type { CountryCode } from "@/shared/kernel/countries";
import { countryProfile } from "@/shared/kernel/countries";

// Warning for units of a country whose legal rules were not validated (PRD F16, PRD Section 7).
// Renders nothing for Brazil.
export function LegalBanner({ country }: { country: CountryCode }) {
  const t = useTranslations("units");
  if (countryProfile(country).legalRulesValidated) return null;
  return (
    <Alert>
      <AlertDescription>{t("legalBanner")}</AlertDescription>
    </Alert>
  );
}
