export function isBrowserOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function isNetworkError(error: unknown) {
  if (isBrowserOffline()) return true;

  const maybeError = error as { message?: string; name?: string; code?: string } | null;
  const text = [maybeError?.message, maybeError?.name, maybeError?.code]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    text.includes('failed to fetch') ||
    text.includes('network') ||
    text.includes('internet_disconnected') ||
    text.includes('err_internet_disconnected') ||
    text.includes('err_network_changed') ||
    text.includes('signal is aborted') ||
    text.includes('storageunknownerror')
  );
}

export function logUnlessNetworkError(label: string, error: unknown) {
  if (!isNetworkError(error)) {
    console.error(label, error);
  }
}

