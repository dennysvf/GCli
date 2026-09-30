import { parseArgs } from "node:util";
import { registerModules } from "@/composition";
import { identity, identityMessages } from "@/modules/identity";
import { db } from "@/shared/db/client";

// First organization and administrator (spec F01 section 3). Runs once per environment:
//   npm run setup:admin -- --org-name "Clínica Exemplo" --admin-name "Ana Lima" --admin-email ana@exemplo.com.br
// Optional: --legal-name "Clínica Exemplo Ltda" --cnpj 12.ABC.345/01DE-35
const USAGE =
  'Uso: npm run setup:admin -- --org-name "Clínica" --admin-name "Nome" --admin-email email@dominio [--legal-name "Razão social"] [--cnpj CNPJ]';

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      "org-name": { type: "string" },
      "legal-name": { type: "string" },
      cnpj: { type: "string" },
      "admin-name": { type: "string" },
      "admin-email": { type: "string" },
    },
  });
  if (!values["org-name"] || !values["admin-name"] || !values["admin-email"]) {
    console.error(USAGE);
    return 1;
  }

  registerModules();
  const result = await identity.setupFirstAdministrator({
    organizationName: values["org-name"],
    legalName: values["legal-name"],
    cnpj: values.cnpj,
    adminName: values["admin-name"],
    adminEmail: values["admin-email"],
  });
  if (!result.ok) {
    const fields = result.error.fields ? ` ${JSON.stringify(result.error.fields)}` : "";
    console.error(`Erro: ${identityMessages[result.error.code] ?? result.error.code}${fields}`);
    return 1;
  }

  console.log("Organização criada e convite de administrador enviado por e-mail.");
  console.log(`Link do convite (válido até ${result.value.expiresAt.toLocaleString("pt-BR")}):`);
  console.log(result.value.invitationUrl);
  return 0;
}

main()
  .then(async (code) => {
    await db().$disconnect();
    process.exit(code);
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await db().$disconnect();
    process.exit(1);
  });
