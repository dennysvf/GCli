import type { ServicePricing } from "../application/ports";

// Default until services (F03) registers its implementation: no service lacks a price.
export const noPricing: ServicePricing = {
  servicesWithoutPrice: async () => [],
};
