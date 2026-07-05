"use client";

import { useEffectivePathname } from "@/contexts/MainTabShellContext";
import {
  resolveStoryReturnPath,
  stashStoryReturnTo,
} from "@/lib/navigation/storyReturnNav";

export function useStoryReturnStash() {
  const effectivePath = useEffectivePathname();

  return () => {
    stashStoryReturnTo(resolveStoryReturnPath(effectivePath));
  };
}
