export function formatTimeAgo(date?: Date | null) {
  if (!date) return "";

  const seconds = Math.floor(
    (new Date().getTime() - date.getTime()) / 1000
  );

  if (seconds < 60) return "ahora";

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return "hace " + minutes + " min";
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return "hace " + hours + " h";
  }

  const days = Math.floor(hours / 24);

  return "hace " + days + " d";
}
