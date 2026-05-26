"use client";

import { memo } from "react";

import { getShuffleSlotCount } from "@/lib/shuffle/shuffleSlotsStore";
import ShuffleSlotRow from "./ShuffleSlotRow";

const SLOT_COUNT = getShuffleSlotCount();

function ShuffleSlots() {
  return (
    <div data-shuffle-list data-stm-no-polish>
      {Array.from({ length: SLOT_COUNT }, (_, slot) => (
        <ShuffleSlotRow key={slot} slot={slot} />
      ))}
    </div>
  );
}

export default memo(ShuffleSlots);
