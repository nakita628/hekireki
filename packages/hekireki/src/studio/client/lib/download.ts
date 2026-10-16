/**
 * Hands the browser a file to save: a link to the blob, clicked for the person, and let go of
 * once the download has had its moment to start, since a browser may still be reading the URL
 * as the click returns.
 */
export function downloadFile(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 1000)
}
