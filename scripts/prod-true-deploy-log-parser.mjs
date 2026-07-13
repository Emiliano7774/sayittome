/**
 * Parse Firebase hosting deploy log upload statistics.
 * Uses the LAST "uploading new files [N/M]" line (not the initial [0/M]).
 */

export function parseDeployUploadStats(logText) {
  const foundMatches = [...String(logText).matchAll(/found (\d+) files/gi)];
  const uploadMatches = [
    ...String(logText).matchAll(/uploading new files \[(\d+)\/(\d+)\]/gi),
  ];
  const releaseComplete = /release complete/i.test(logText);
  const uploadComplete = /upload complete/i.test(logText);

  const found = foundMatches.length ? foundMatches[foundMatches.length - 1] : null;
  const lastUpload = uploadMatches.length ? uploadMatches[uploadMatches.length - 1] : null;

  const filesFound = found ? Number(found[1]) : null;
  const newFilesUploaded = lastUpload ? Number(lastUpload[1]) : 0;
  const newFilesTotal = lastUpload ? Number(lastUpload[2]) : null;
  const cachedOrSkipped =
    newFilesTotal != null ? Math.max(0, newFilesTotal - newFilesUploaded) : null;

  return {
    filesFound,
    newFilesUploaded,
    newFilesTotal,
    cachedOrSkipped,
    releaseComplete,
    uploadComplete,
  };
}
