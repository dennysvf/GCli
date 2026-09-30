"use client";

import { useSyncExternalStore, type ComponentProps } from "react";

const subscribe = () => () => {};

// False in the server-rendered HTML, true once React has hydrated the page.
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

// Keeps form fields disabled until hydration. react-hook-form initializes its fields when it
// hydrates, so text typed before that (slow devices or networks) would be silently lost.
export function HydratedFieldset({ disabled, className, ...props }: ComponentProps<"fieldset">) {
  const hydrated = useHydrated();
  return (
    <fieldset
      disabled={!hydrated || disabled}
      data-hydrated={hydrated}
      className={["contents", className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}
