"use client";

import { memo } from "react";

import ShuffleProfileRow, { type ShuffleProfile } from "./ShuffleProfileRow";

type Props = {
  profiles: ShuffleProfile[];
};

function ShuffleProfileList({ profiles }: Props) {
  return (
    <div>
      {profiles.map((profile, slot) => (
        <ShuffleProfileRow key={slot} slot={slot} profile={profile} />
      ))}
    </div>
  );
}

export default memo(ShuffleProfileList);
