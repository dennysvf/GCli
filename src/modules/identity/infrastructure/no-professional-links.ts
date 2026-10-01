import type { ProfessionalLinks } from "../application/ports";

// Default until professionals (F04) registers its implementation: nobody is linked.
export const noProfessionalLinks: ProfessionalLinks = {
  findLinkedProfessionalId: async () => null,
  linkedProfessionals: async () => new Map(),
};
