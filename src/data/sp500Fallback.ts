import type { AnnualReturn } from '../types';

/**
 * Historical S&P 500 annual returns, 1928-2025.
 *
 * Source: Aswath Damodaran (NYU Stern), "Historical Returns on Stocks, Bonds
 * and Bills" (histretSP.xls, pages.stern.nyu.edu/~adamodar). This is the same
 * public dataset referenced in Section 3.3 Option C of the requirements doc.
 *
 * - totalReturn: the "S&P 500 (includes dividends)" column, used directly from
 *   the source file — this is the realistic return for an actual index fund
 *   investment and drives the "My Actual Amount" calculation by default.
 * - priceReturn: derived from the source file's raw S&P 500 index level
 *   (year-over-year % change, no dividends), for the price-only comparison
 *   column in the results table.
 *
 * This is the sole data source for this build (no live API — see README).
 */
export const SP500_FALLBACK_DATA: AnnualReturn[] = [
  { year: 1928, priceReturn: 0.378822, totalReturn: 0.438112 },
  { year: 1929, priceReturn: -0.119097, totalReturn: -0.082979 },
  { year: 1930, priceReturn: -0.284848, totalReturn: -0.251236 },
  { year: 1931, priceReturn: -0.470665, totalReturn: -0.438375 },
  { year: 1932, priceReturn: -0.147783, totalReturn: -0.086424 },
  { year: 1933, priceReturn: 0.440751, totalReturn: 0.499822 },
  { year: 1934, priceReturn: -0.047141, totalReturn: -0.011886 },
  { year: 1935, priceReturn: 0.413684, totalReturn: 0.467404 },
  { year: 1936, priceReturn: 0.279226, totalReturn: 0.319434 },
  { year: 1937, priceReturn: -0.385914, totalReturn: -0.353367 },
  { year: 1938, priceReturn: 0.245498, totalReturn: 0.292827 },
  { year: 1939, priceReturn: -0.05175, totalReturn: -0.010976 },
  { year: 1940, priceReturn: -0.150883, totalReturn: -0.106729 },
  { year: 1941, priceReturn: -0.178639, totalReturn: -0.127715 },
  { year: 1942, priceReturn: 0.124281, totalReturn: 0.191738 },
  { year: 1943, priceReturn: 0.194473, totalReturn: 0.250613 },
  { year: 1944, priceReturn: 0.137961, totalReturn: 0.190307 },
  { year: 1945, priceReturn: 0.307229, totalReturn: 0.358211 },
  { year: 1946, priceReturn: -0.118664, totalReturn: -0.084291 },
  { year: 1947, priceReturn: 0.0, totalReturn: 0.052 },
  { year: 1948, priceReturn: -0.006536, totalReturn: 0.057046 },
  { year: 1949, priceReturn: 0.104605, totalReturn: 0.183032 },
  { year: 1950, priceReturn: 0.216796, totalReturn: 0.308055 },
  { year: 1951, priceReturn: 0.163485, totalReturn: 0.236785 },
  { year: 1952, priceReturn: 0.117796, totalReturn: 0.18151 },
  { year: 1953, priceReturn: -0.06624, totalReturn: -0.012082 },
  { year: 1954, priceReturn: 0.450222, totalReturn: 0.525633 },
  { year: 1955, priceReturn: 0.264036, totalReturn: 0.325973 },
  { year: 1956, priceReturn: 0.026165, totalReturn: 0.074395 },
  { year: 1957, priceReturn: -0.143133, totalReturn: -0.104574 },
  { year: 1958, priceReturn: 0.380595, totalReturn: 0.4372 },
  { year: 1959, priceReturn: 0.084767, totalReturn: 0.120565 },
  { year: 1960, priceReturn: -0.029721, totalReturn: 0.003365 },
  { year: 1961, priceReturn: 0.231285, totalReturn: 0.266377 },
  { year: 1962, priceReturn: -0.118099, totalReturn: -0.088115 },
  { year: 1963, priceReturn: 0.188906, totalReturn: 0.226119 },
  { year: 1964, priceReturn: 0.129699, totalReturn: 0.164155 },
  { year: 1965, priceReturn: 0.090619, totalReturn: 0.123992 },
  { year: 1966, priceReturn: -0.13091, totalReturn: -0.09971 },
  { year: 1967, priceReturn: 0.200921, totalReturn: 0.23803 },
  { year: 1968, priceReturn: 0.076604, totalReturn: 0.108149 },
  { year: 1969, priceReturn: -0.113614, totalReturn: -0.082414 },
  { year: 1970, priceReturn: 0.000978, totalReturn: 0.035611 },
  { year: 1971, priceReturn: 0.107868, totalReturn: 0.142212 },
  { year: 1972, priceReturn: 0.156333, totalReturn: 0.187554 },
  { year: 1973, priceReturn: -0.173655, totalReturn: -0.14308 },
  { year: 1974, priceReturn: -0.297181, totalReturn: -0.259018 },
  { year: 1975, priceReturn: 0.31549, totalReturn: 0.369951 },
  { year: 1976, priceReturn: 0.191485, totalReturn: 0.23831 },
  { year: 1977, priceReturn: -0.11502, totalReturn: -0.069797 },
  { year: 1978, priceReturn: 0.01062, totalReturn: 0.065093 },
  { year: 1979, priceReturn: 0.123088, totalReturn: 0.185195 },
  { year: 1980, priceReturn: 0.257736, totalReturn: 0.317352 },
  { year: 1981, priceReturn: -0.097304, totalReturn: -0.047024 },
  { year: 1982, priceReturn: 0.147613, totalReturn: 0.204191 },
  { year: 1983, priceReturn: 0.17271, totalReturn: 0.223372 },
  { year: 1984, priceReturn: 0.014006, totalReturn: 0.061461 },
  { year: 1985, priceReturn: 0.263334, totalReturn: 0.312351 },
  { year: 1986, priceReturn: 0.146204, totalReturn: 0.184946 },
  { year: 1987, priceReturn: 0.020275, totalReturn: 0.058127 },
  { year: 1988, priceReturn: 0.124008, totalReturn: 0.165372 },
  { year: 1989, priceReturn: 0.272505, totalReturn: 0.314752 },
  { year: 1990, priceReturn: -0.065591, totalReturn: -0.030645 },
  { year: 1991, priceReturn: 0.263067, totalReturn: 0.302348 },
  { year: 1992, priceReturn: 0.044643, totalReturn: 0.074937 },
  { year: 1993, priceReturn: 0.070552, totalReturn: 0.099671 },
  { year: 1994, priceReturn: -0.015393, totalReturn: 0.013259 },
  { year: 1995, priceReturn: 0.341107, totalReturn: 0.371952 },
  { year: 1996, priceReturn: 0.202637, totalReturn: 0.22681 },
  { year: 1997, priceReturn: 0.310082, totalReturn: 0.331037 },
  { year: 1998, priceReturn: 0.266686, totalReturn: 0.28338 },
  { year: 1999, priceReturn: 0.19526, totalReturn: 0.208854 },
  { year: 2000, priceReturn: -0.101392, totalReturn: -0.090318 },
  { year: 2001, priceReturn: -0.130419, totalReturn: -0.118498 },
  { year: 2002, priceReturn: -0.233666, totalReturn: -0.21966 },
  { year: 2003, priceReturn: 0.263793, totalReturn: 0.283558 },
  { year: 2004, priceReturn: 0.089944, totalReturn: 0.107428 },
  { year: 2005, priceReturn: 0.03001, totalReturn: 0.048345 },
  { year: 2006, priceReturn: 0.136194, totalReturn: 0.156126 },
  { year: 2007, priceReturn: 0.035296, totalReturn: 0.054847 },
  { year: 2008, priceReturn: -0.384858, totalReturn: -0.365523 },
  { year: 2009, priceReturn: 0.234542, totalReturn: 0.259352 },
  { year: 2010, priceReturn: 0.127827, totalReturn: 0.148211 },
  { year: 2011, priceReturn: -0.000032, totalReturn: 0.020984 },
  { year: 2012, priceReturn: 0.134057, totalReturn: 0.158906 },
  { year: 2013, priceReturn: 0.296012, totalReturn: 0.321451 },
  { year: 2014, priceReturn: 0.113906, totalReturn: 0.135244 },
  { year: 2015, priceReturn: -0.007285, totalReturn: 0.013789 },
  { year: 2016, priceReturn: 0.095372, totalReturn: 0.117731 },
  { year: 2017, priceReturn: 0.1942, totalReturn: 0.216055 },
  { year: 2018, priceReturn: -0.062373, totalReturn: -0.042269 },
  { year: 2019, priceReturn: 0.288781, totalReturn: 0.312117 },
  { year: 2020, priceReturn: 0.162589, totalReturn: 0.180232 },
  { year: 2021, priceReturn: 0.268927, totalReturn: 0.284689 },
  { year: 2022, priceReturn: -0.194428, totalReturn: -0.180375 },
  { year: 2023, priceReturn: 0.242297, totalReturn: 0.260607 },
  { year: 2024, priceReturn: 0.233098, totalReturn: 0.248786 },
  { year: 2025, priceReturn: 0.163878, totalReturn: 0.177237 },
];

export const SP500_DATA_MIN_YEAR = SP500_FALLBACK_DATA[0].year;
export const SP500_DATA_MAX_YEAR = SP500_FALLBACK_DATA[SP500_FALLBACK_DATA.length - 1].year;

const RETURNS_BY_YEAR = new Map(SP500_FALLBACK_DATA.map((row) => [row.year, row]));

export function getAnnualReturn(year: number): AnnualReturn | undefined {
  return RETURNS_BY_YEAR.get(year);
}
