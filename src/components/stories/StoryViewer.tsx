"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

type Story = {
  id: string;
  image: string;
};

type Props = {
  stories: Story[];
};

export default function StoryViewer({
  stories,
}: Props) {
  const [
    index,
    setIndex,
  ] = useState(0);

  const [
    paused,
    setPaused,
  ] = useState(false);

  const timer =
    useRef<
      ReturnType<
        typeof setTimeout
      > | null
    >(null);

  const current =
    stories[index];

  useEffect(() => {
    if (paused) return;

    timer.current =
      setTimeout(() => {
        setIndex((old) => {
          if (
            old >=
            stories.length - 1
          ) {
            return old;
          }

          return old + 1;
        });
      }, 5500);

    return () => {
      if (timer.current)
        clearTimeout(
          timer.current,
        );
    };
  }, [
    index,
    paused,
    stories.length,
  ]);

  return (
    <main
      className="fixed inset-0 z-[99999] bg-black text-white"
      onMouseDown={() =>
        setPaused(true)
      }
      onMouseUp={() =>
        setPaused(false)
      }
      onTouchStart={() =>
        setPaused(true)
      }
      onTouchEnd={() =>
        setPaused(false)
      }
    >
      <div className="absolute left-0 right-0 top-0 z-30 flex gap-2 px-3 py-3">

        {stories.map(
          (_, i) => (
            <div
              key={i}
              className="h-1 flex-1 overflow-hidden rounded-full bg-white/20"
            >
              <div
                className={[
                  "h-full bg-white transition-all",
                  i <= index
                    ? "w-full"
                    : "w-0",
                ].join(" ")}
              />
            </div>
          ),
        )}
      </div>

      <button
        onClick={() =>
          setIndex((old) =>
            Math.max(
              0,
              old - 1,
            ),
          )
        }
        className="absolute left-0 top-0 z-20 h-full w-1/2"
      />

      <button
        onClick={() =>
          setIndex((old) =>
            Math.min(
              stories.length -
                1,
              old + 1,
            ),
          )
        }
        className="absolute right-0 top-0 z-20 h-full w-1/2"
      />

      <div className="flex h-full items-center justify-center">

        <img
          src={current.image}
          className="h-full w-full object-contain"
        />
      </div>
    </main>
  );
}
