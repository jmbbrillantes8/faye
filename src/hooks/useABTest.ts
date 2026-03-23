"use client";

import { useEffect, useState } from "react";

const VARIANTS = {
  a: "For when work gets heavy.",
  b: "Because burnout shouldn't be the norm.",
} as const;

export type ABVariant = keyof typeof VARIANTS;

const STORAGE_KEY = "faye_ab_headline";

function assignVariant(): ABVariant {
  return Math.random() < 0.5 ? "a" : "b";
}

export function useABTest() {
  const [variant, setVariant] = useState<ABVariant | null>(null);

  useEffect(() => {
    let assigned = localStorage.getItem(STORAGE_KEY) as ABVariant | null;
    if (assigned !== "a" && assigned !== "b") {
      assigned = assignVariant();
      localStorage.setItem(STORAGE_KEY, assigned);
      console.log(`[A/B] Assigned variant: ${assigned}`);
    }
    setVariant(assigned);
  }, []);

  return {
    variant,
    headline: variant ? VARIANTS[variant] : null,
  };
}
