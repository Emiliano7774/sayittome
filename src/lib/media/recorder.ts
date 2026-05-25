export async function startRecorder() {
  const stream =
    await navigator
      .mediaDevices
      .getUserMedia({
        audio: true,
      });

  const chunks: Blob[] =
    [];

  const recorder =
    new MediaRecorder(
      stream,
    );

  recorder.ondataavailable =
    (event) => {
      if (
        event.data.size > 0
      ) {
        chunks.push(
          event.data,
        );
      }
    };

  recorder.start();

  return {
    recorder,

    stop: async () => {
      return new Promise<Blob>(
        (resolve) => {
          recorder.onstop =
            () => {
              const blob =
                new Blob(
                  chunks,
                  {
                    type: "audio/webm",
                  },
                );

              stream
                .getTracks()
                .forEach((t) =>
                  t.stop(),
                );

              resolve(
                blob,
              );
            };

          recorder.stop();
        },
      );
    },
  };
}
