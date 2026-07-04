const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

interface Cache<T> {
  data: T;
  expiresAt: number;
}

export interface CurrencyRatesResponse {
  base: 'USD';
  rates: Record<string, number>;
  updatedAt: string;
  source: 'live' | 'fallback';
}

export interface CountryInfo {
  name: string;
  cca2: string;
  currency: string | null;
}

let currencyCache: Cache<CurrencyRatesResponse> | null = null;
let countriesCache: Cache<CountryInfo[]> | null = null;

// Static fallback so the endpoint never fails, even with no internet access.
const FALLBACK_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  INR: 83.3,
  JPY: 149.5,
  AUD: 1.52,
  CAD: 1.36,
  CNY: 7.24,
  AED: 3.67,
  SGD: 1.34,
};

const FALLBACK_COUNTRIES: CountryInfo[] = [
  { name: 'United States', cca2: 'US', currency: 'USD' },
  { name: 'India', cca2: 'IN', currency: 'INR' },
  { name: 'United Kingdom', cca2: 'GB', currency: 'GBP' },
  { name: 'Canada', cca2: 'CA', currency: 'CAD' },
  { name: 'Australia', cca2: 'AU', currency: 'AUD' },
  { name: 'Germany', cca2: 'DE', currency: 'EUR' },
  { name: 'France', cca2: 'FR', currency: 'EUR' },
  { name: 'Japan', cca2: 'JP', currency: 'JPY' },
  { name: 'United Arab Emirates', cca2: 'AE', currency: 'AED' },
  { name: 'Singapore', cca2: 'SG', currency: 'SGD' },
];

async function fetchJson(url: string, timeoutMs = 5000): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Request to ${url} failed with status ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function getCurrencyRates(): Promise<CurrencyRatesResponse> {
  const now = Date.now();
  if (currencyCache && currencyCache.expiresAt > now) {
    return currencyCache.data;
  }

  try {
    const json = (await fetchJson('https://api.exchangerate-api.com/v4/latest/USD')) as {
      rates?: Record<string, number>;
    };
    if (!json.rates) throw new Error('Malformed response from primary exchange rate provider');

    const data: CurrencyRatesResponse = {
      base: 'USD',
      rates: json.rates,
      updatedAt: new Date().toISOString(),
      source: 'live',
    };
    currencyCache = { data, expiresAt: now + ONE_HOUR_MS };
    return data;
  } catch (primaryError) {
    try {
      const json = (await fetchJson('https://open.er-api.com/v6/latest/USD')) as {
        rates?: Record<string, number>;
      };
      if (!json.rates) throw new Error('Malformed response from secondary exchange rate provider');

      const data: CurrencyRatesResponse = {
        base: 'USD',
        rates: json.rates,
        updatedAt: new Date().toISOString(),
        source: 'live',
      };
      currencyCache = { data, expiresAt: now + ONE_HOUR_MS };
      return data;
    } catch (secondaryError) {
      console.error(
        '[meta] Failed to fetch live currency rates, using static fallback table:',
        primaryError instanceof Error ? primaryError.message : primaryError,
        secondaryError instanceof Error ? secondaryError.message : secondaryError,
      );

      const data: CurrencyRatesResponse = {
        base: 'USD',
        rates: FALLBACK_RATES,
        updatedAt: new Date().toISOString(),
        source: 'fallback',
      };
      // Cache the fallback too (briefly) so repeated failures don't hammer the upstream APIs.
      currencyCache = { data, expiresAt: now + ONE_HOUR_MS };
      return data;
    }
  }
}

interface RestCountry {
  name?: { common?: string };
  cca2?: string;
  currencies?: Record<string, unknown>;
}

export async function getCountries(): Promise<CountryInfo[]> {
  const now = Date.now();
  if (countriesCache && countriesCache.expiresAt > now) {
    return countriesCache.data;
  }

  try {
    const json = (await fetchJson(
      'https://restcountries.com/v3.1/all?fields=name,cca2,currencies',
    )) as RestCountry[];

    const countries: CountryInfo[] = json
      .filter((c) => c.name?.common && c.cca2)
      .map((c) => ({
        name: c.name!.common as string,
        cca2: c.cca2 as string,
        currency: c.currencies ? Object.keys(c.currencies)[0] ?? null : null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    countriesCache = { data: countries, expiresAt: now + ONE_DAY_MS };
    return countries;
  } catch (error) {
    console.error(
      '[meta] Failed to fetch countries list, using static fallback:',
      error instanceof Error ? error.message : error,
    );
    countriesCache = { data: FALLBACK_COUNTRIES, expiresAt: now + ONE_DAY_MS };
    return FALLBACK_COUNTRIES;
  }
}
