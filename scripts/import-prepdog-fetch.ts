const MAX_FETCH_ATTEMPTS = 3;

export async function fetchText(url: string) {
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    const response = await fetch(url);
    if (response.ok) {
      return response.text();
    }

    lastStatus = response.status;
    if (!isRetryableFetchStatus(response.status) || attempt === MAX_FETCH_ATTEMPTS) {
      throw new Error(describeFetchFailure(url, response.status));
    }
  }

  throw new Error(describeFetchFailure(url, lastStatus ?? 0));
}

export function isRetryableFetchStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

export function describeFetchFailure(url: string, status: number) {
  if (status === 522) {
    return `Failed to fetch ${url}: 522. PrepDog upstream is unavailable behind Cloudflare right now, so the importer cannot reach the source pages. Retry later when prepdog.org is back.`;
  }

  return `Failed to fetch ${url}: ${status}`;
}