-- F16: internationalization and country profiles (ADR-028, ADR-029, ADR-030).
-- Every existing record was created under the Brazilian rules, so data migrates as Brazil, BRL and pt-BR.

-- Languages and headquarters country
ALTER TABLE "organization"
    ADD COLUMN "country" CHAR(2) NOT NULL DEFAULT 'BR',
    ADD COLUMN "default_locale" VARCHAR(5) NOT NULL DEFAULT 'pt-BR',
    ADD CONSTRAINT "ck_organization_country" CHECK ("country" IN ('BR','PT','ES','MX','AR','CL','CO','US')),
    ADD CONSTRAINT "ck_organization_locale" CHECK ("default_locale" IN ('pt-BR','en','es'));

-- A null user language means "use the organization default".
ALTER TABLE "app_user"
    ADD COLUMN "locale" VARCHAR(5),
    ADD CONSTRAINT "ck_app_user_locale" CHECK ("locale" IS NULL OR "locale" IN ('pt-BR','en','es'));

ALTER TABLE "invitation"
    ADD COLUMN "locale" VARCHAR(5) NOT NULL DEFAULT 'pt-BR',
    ADD CONSTRAINT "ck_invitation_locale" CHECK ("locale" IN ('pt-BR','en','es'));
