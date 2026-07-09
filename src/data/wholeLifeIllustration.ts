export interface WholeLifeYearRow {
  year: number;
  age: number;
  premium: number;
  guaranteedCashValue: number;
  nonGuaranteedCashValue: number;
  dividend: number;
  guaranteedDeathBenefit: number;
  nonGuaranteedDeathBenefit: number;
  /**
   * true = these figures come directly from the source illustration screenshots
   * (Section 12.2 of the requirements doc). false = linearly interpolated
   * between the nearest two exact anchor years, because the full row-by-row
   * screenshots for those years weren't available for this build. Interpolated
   * years should be replaced with exact illustration data when available
   * (Section 12.8 open item) — the compounding curve is not actually linear,
   * so interpolated years understate mid-gap growth somewhat.
   */
  isExactFromIllustration: boolean;
}

/** Base Contract Premium, $/year, constant for the full 55-year illustration. */
export const BASE_CONTRACT_PREMIUM = 3151;
/** FPR (Flexible Premium Rider) premium, $/year, constant for the full 55-year illustration. */
export const FPR_PREMIUM = 781;
/**
 * The non-APPUA portion of the premium (Base + FPR) — the cost of the insurance
 * wrapper itself, present every year regardless of APPUA funding (Section 12.9).
 */
export const NON_APPUA_PREMIUM = BASE_CONTRACT_PREMIUM + FPR_PREMIUM;

export const ORIGINAL_FRONT_LOADED_PREMIUM = 20000; // years 1-7
export const ORIGINAL_SUSTAINING_PREMIUM = 3931; // years 8-55
export const FRONT_LOADED_YEARS = 7;

/**
 * Reference illustration — Penn Mutual, issue age 44, 7-pay over-funded
 * high-cash-value design (Policy Form ICC18-TL, illustration dated 2023.07.03,
 * WL2021 product). Non-guaranteed values are not guaranteed and assume
 * continuation of the current dividend scale (Section 12.7).
 *
 * Anchor years (isExactFromIllustration: true) are sourced directly from the
 * illustration screenshots. All other years are linearly interpolated between
 * the nearest anchors — see the isExactFromIllustration doc comment above.
 */
export const WHOLE_LIFE_ILLUSTRATION: WholeLifeYearRow[] = [
  { year: 1, age: 44, premium: 20000, guaranteedCashValue: 15493, nonGuaranteedCashValue: 15889, dividend: 396, guaranteedDeathBenefit: 402389, nonGuaranteedDeathBenefit: 402785, isExactFromIllustration: true },
  { year: 2, age: 45, premium: 20000, guaranteedCashValue: 34957, nonGuaranteedCashValue: 37033, dividend: 921, guaranteedDeathBenefit: 410494, nonGuaranteedDeathBenefit: 414598, isExactFromIllustration: false },
  { year: 3, age: 46, premium: 20000, guaranteedCashValue: 54420, nonGuaranteedCashValue: 58178, dividend: 1446, guaranteedDeathBenefit: 418599, nonGuaranteedDeathBenefit: 426412, isExactFromIllustration: false },
  { year: 4, age: 47, premium: 20000, guaranteedCashValue: 73884, nonGuaranteedCashValue: 79322, dividend: 1972, guaranteedDeathBenefit: 426704, nonGuaranteedDeathBenefit: 438226, isExactFromIllustration: false },
  { year: 5, age: 48, premium: 20000, guaranteedCashValue: 93348, nonGuaranteedCashValue: 100466, dividend: 2497, guaranteedDeathBenefit: 434809, nonGuaranteedDeathBenefit: 450039, isExactFromIllustration: true },
  { year: 6, age: 49, premium: 20000, guaranteedCashValue: 114933, nonGuaranteedCashValue: 125426, dividend: 3184, guaranteedDeathBenefit: 478458, nonGuaranteedDeathBenefit: 501258, isExactFromIllustration: true },
  { year: 7, age: 50, premium: 20000, guaranteedCashValue: 137120, nonGuaranteedCashValue: 151844, dividend: 3949, guaranteedDeathBenefit: 520963, nonGuaranteedDeathBenefit: 553072, isExactFromIllustration: true },
  { year: 8, age: 51, premium: 3931, guaranteedCashValue: 144410, nonGuaranteedCashValue: 163820, dividend: 4293, guaranteedDeathBenefit: 522881, nonGuaranteedDeathBenefit: 565655, isExactFromIllustration: true },
  { year: 9, age: 52, premium: 3931, guaranteedCashValue: 152398, nonGuaranteedCashValue: 178718, dividend: 4725, guaranteedDeathBenefit: 524611, nonGuaranteedDeathBenefit: 580676, isExactFromIllustration: false },
  { year: 10, age: 53, premium: 3931, guaranteedCashValue: 160385, nonGuaranteedCashValue: 193617, dividend: 5157, guaranteedDeathBenefit: 526341, nonGuaranteedDeathBenefit: 595697, isExactFromIllustration: false },
  { year: 11, age: 54, premium: 3931, guaranteedCashValue: 168373, nonGuaranteedCashValue: 208515, dividend: 5589, guaranteedDeathBenefit: 528071, nonGuaranteedDeathBenefit: 610718, isExactFromIllustration: false },
  { year: 12, age: 55, premium: 3931, guaranteedCashValue: 176361, nonGuaranteedCashValue: 223414, dividend: 6020, guaranteedDeathBenefit: 529801, nonGuaranteedDeathBenefit: 625739, isExactFromIllustration: false },
  { year: 13, age: 56, premium: 3931, guaranteedCashValue: 184349, nonGuaranteedCashValue: 238312, dividend: 6452, guaranteedDeathBenefit: 531531, nonGuaranteedDeathBenefit: 640760, isExactFromIllustration: false },
  { year: 14, age: 57, premium: 3931, guaranteedCashValue: 192336, nonGuaranteedCashValue: 253211, dividend: 6884, guaranteedDeathBenefit: 533261, nonGuaranteedDeathBenefit: 655781, isExactFromIllustration: false },
  { year: 15, age: 58, premium: 3931, guaranteedCashValue: 200324, nonGuaranteedCashValue: 268109, dividend: 7316, guaranteedDeathBenefit: 534991, nonGuaranteedDeathBenefit: 670802, isExactFromIllustration: true },
  { year: 16, age: 59, premium: 3931, guaranteedCashValue: 209027, nonGuaranteedCashValue: 289035, dividend: 7965, guaranteedDeathBenefit: 536441, nonGuaranteedDeathBenefit: 690770, isExactFromIllustration: false },
  { year: 17, age: 60, premium: 3931, guaranteedCashValue: 217730, nonGuaranteedCashValue: 309962, dividend: 8614, guaranteedDeathBenefit: 537890, nonGuaranteedDeathBenefit: 710738, isExactFromIllustration: false },
  { year: 18, age: 61, premium: 3931, guaranteedCashValue: 226433, nonGuaranteedCashValue: 330888, dividend: 9263, guaranteedDeathBenefit: 539340, nonGuaranteedDeathBenefit: 730706, isExactFromIllustration: false },
  { year: 19, age: 62, premium: 3931, guaranteedCashValue: 235135, nonGuaranteedCashValue: 351815, dividend: 9913, guaranteedDeathBenefit: 540790, nonGuaranteedDeathBenefit: 750673, isExactFromIllustration: false },
  { year: 20, age: 63, premium: 3931, guaranteedCashValue: 243838, nonGuaranteedCashValue: 372741, dividend: 10562, guaranteedDeathBenefit: 542240, nonGuaranteedDeathBenefit: 770641, isExactFromIllustration: false },
  { year: 21, age: 64, premium: 3931, guaranteedCashValue: 252541, nonGuaranteedCashValue: 393668, dividend: 11211, guaranteedDeathBenefit: 543689, nonGuaranteedDeathBenefit: 790609, isExactFromIllustration: false },
  { year: 22, age: 65, premium: 3931, guaranteedCashValue: 261244, nonGuaranteedCashValue: 414594, dividend: 11860, guaranteedDeathBenefit: 545139, nonGuaranteedDeathBenefit: 810577, isExactFromIllustration: true },
  { year: 23, age: 66, premium: 3931, guaranteedCashValue: 270460, nonGuaranteedCashValue: 441345, dividend: 12761, guaranteedDeathBenefit: 546424, nonGuaranteedDeathBenefit: 835028, isExactFromIllustration: false },
  { year: 24, age: 67, premium: 3931, guaranteedCashValue: 279677, nonGuaranteedCashValue: 468097, dividend: 13661, guaranteedDeathBenefit: 547710, nonGuaranteedDeathBenefit: 859479, isExactFromIllustration: false },
  { year: 25, age: 68, premium: 3931, guaranteedCashValue: 288893, nonGuaranteedCashValue: 494848, dividend: 14562, guaranteedDeathBenefit: 548995, nonGuaranteedDeathBenefit: 883930, isExactFromIllustration: true },
  { year: 26, age: 69, premium: 3931, guaranteedCashValue: 298351, nonGuaranteedCashValue: 527470, dividend: 15677, guaranteedDeathBenefit: 550172, nonGuaranteedDeathBenefit: 912933, isExactFromIllustration: false },
  { year: 27, age: 70, premium: 3931, guaranteedCashValue: 307809, nonGuaranteedCashValue: 560092, dividend: 16792, guaranteedDeathBenefit: 551349, nonGuaranteedDeathBenefit: 941937, isExactFromIllustration: false },
  { year: 28, age: 71, premium: 3931, guaranteedCashValue: 317267, nonGuaranteedCashValue: 592715, dividend: 17907, guaranteedDeathBenefit: 552525, nonGuaranteedDeathBenefit: 970940, isExactFromIllustration: false },
  { year: 29, age: 72, premium: 3931, guaranteedCashValue: 326725, nonGuaranteedCashValue: 625337, dividend: 19022, guaranteedDeathBenefit: 553702, nonGuaranteedDeathBenefit: 999944, isExactFromIllustration: false },
  { year: 30, age: 73, premium: 3931, guaranteedCashValue: 336183, nonGuaranteedCashValue: 657959, dividend: 20137, guaranteedDeathBenefit: 554879, nonGuaranteedDeathBenefit: 1028947, isExactFromIllustration: true },
  { year: 31, age: 74, premium: 3931, guaranteedCashValue: 345770, nonGuaranteedCashValue: 695506, dividend: 21401, guaranteedDeathBenefit: 555983, nonGuaranteedDeathBenefit: 1061619, isExactFromIllustration: true },
  { year: 32, age: 75, premium: 3931, guaranteedCashValue: 355217, nonGuaranteedCashValue: 742475, dividend: 22988, guaranteedDeathBenefit: 556988, nonGuaranteedDeathBenefit: 1101262, isExactFromIllustration: false },
  { year: 33, age: 76, premium: 3931, guaranteedCashValue: 364665, nonGuaranteedCashValue: 789444, dividend: 24576, guaranteedDeathBenefit: 557993, nonGuaranteedDeathBenefit: 1140906, isExactFromIllustration: false },
  { year: 34, age: 77, premium: 3931, guaranteedCashValue: 374112, nonGuaranteedCashValue: 836413, dividend: 26163, guaranteedDeathBenefit: 558998, nonGuaranteedDeathBenefit: 1180549, isExactFromIllustration: false },
  { year: 35, age: 78, premium: 3931, guaranteedCashValue: 383560, nonGuaranteedCashValue: 883382, dividend: 27750, guaranteedDeathBenefit: 560003, nonGuaranteedDeathBenefit: 1220192, isExactFromIllustration: false },
  { year: 36, age: 79, premium: 3931, guaranteedCashValue: 393007, nonGuaranteedCashValue: 930350, dividend: 29338, guaranteedDeathBenefit: 561008, nonGuaranteedDeathBenefit: 1259836, isExactFromIllustration: false },
  { year: 37, age: 80, premium: 3931, guaranteedCashValue: 402455, nonGuaranteedCashValue: 977319, dividend: 30925, guaranteedDeathBenefit: 562013, nonGuaranteedDeathBenefit: 1299479, isExactFromIllustration: false },
  { year: 38, age: 81, premium: 3931, guaranteedCashValue: 411902, nonGuaranteedCashValue: 1024288, dividend: 32512, guaranteedDeathBenefit: 563018, nonGuaranteedDeathBenefit: 1339122, isExactFromIllustration: false },
  { year: 39, age: 82, premium: 3931, guaranteedCashValue: 421350, nonGuaranteedCashValue: 1071257, dividend: 34100, guaranteedDeathBenefit: 564023, nonGuaranteedDeathBenefit: 1378766, isExactFromIllustration: false },
  { year: 40, age: 83, premium: 3931, guaranteedCashValue: 430797, nonGuaranteedCashValue: 1118226, dividend: 35687, guaranteedDeathBenefit: 565028, nonGuaranteedDeathBenefit: 1418409, isExactFromIllustration: true },
  { year: 41, age: 84, premium: 3931, guaranteedCashValue: 437564, nonGuaranteedCashValue: 1190092, dividend: 38111, guaranteedDeathBenefit: 565876, nonGuaranteedDeathBenefit: 1481467, isExactFromIllustration: false },
  { year: 42, age: 85, premium: 3931, guaranteedCashValue: 444331, nonGuaranteedCashValue: 1261958, dividend: 40535, guaranteedDeathBenefit: 566724, nonGuaranteedDeathBenefit: 1544526, isExactFromIllustration: false },
  { year: 43, age: 86, premium: 3931, guaranteedCashValue: 451098, nonGuaranteedCashValue: 1333824, dividend: 42959, guaranteedDeathBenefit: 567572, nonGuaranteedDeathBenefit: 1607584, isExactFromIllustration: false },
  { year: 44, age: 87, premium: 3931, guaranteedCashValue: 457865, nonGuaranteedCashValue: 1405691, dividend: 45384, guaranteedDeathBenefit: 568419, nonGuaranteedDeathBenefit: 1670642, isExactFromIllustration: false },
  { year: 45, age: 88, premium: 3931, guaranteedCashValue: 464632, nonGuaranteedCashValue: 1477557, dividend: 47808, guaranteedDeathBenefit: 569267, nonGuaranteedDeathBenefit: 1733700, isExactFromIllustration: false },
  { year: 46, age: 89, premium: 3931, guaranteedCashValue: 471399, nonGuaranteedCashValue: 1549423, dividend: 50232, guaranteedDeathBenefit: 570115, nonGuaranteedDeathBenefit: 1796759, isExactFromIllustration: false },
  { year: 47, age: 90, premium: 3931, guaranteedCashValue: 478166, nonGuaranteedCashValue: 1621289, dividend: 52656, guaranteedDeathBenefit: 570963, nonGuaranteedDeathBenefit: 1859817, isExactFromIllustration: false },
  { year: 48, age: 91, premium: 3931, guaranteedCashValue: 484933, nonGuaranteedCashValue: 1693155, dividend: 55080, guaranteedDeathBenefit: 571811, nonGuaranteedDeathBenefit: 1922875, isExactFromIllustration: false },
  { year: 49, age: 92, premium: 3931, guaranteedCashValue: 491700, nonGuaranteedCashValue: 1765021, dividend: 57504, guaranteedDeathBenefit: 572659, nonGuaranteedDeathBenefit: 1985933, isExactFromIllustration: false },
  { year: 50, age: 93, premium: 3931, guaranteedCashValue: 498467, nonGuaranteedCashValue: 1836887, dividend: 59928, guaranteedDeathBenefit: 573507, nonGuaranteedDeathBenefit: 2048992, isExactFromIllustration: false },
  { year: 51, age: 94, premium: 3931, guaranteedCashValue: 505234, nonGuaranteedCashValue: 1908753, dividend: 62352, guaranteedDeathBenefit: 574355, nonGuaranteedDeathBenefit: 2112050, isExactFromIllustration: false },
  { year: 52, age: 95, premium: 3931, guaranteedCashValue: 512001, nonGuaranteedCashValue: 1980620, dividend: 64777, guaranteedDeathBenefit: 575202, nonGuaranteedDeathBenefit: 2175108, isExactFromIllustration: false },
  { year: 53, age: 96, premium: 3931, guaranteedCashValue: 518768, nonGuaranteedCashValue: 2052486, dividend: 67201, guaranteedDeathBenefit: 576050, nonGuaranteedDeathBenefit: 2238166, isExactFromIllustration: false },
  { year: 54, age: 97, premium: 3931, guaranteedCashValue: 525535, nonGuaranteedCashValue: 2124352, dividend: 69625, guaranteedDeathBenefit: 576898, nonGuaranteedDeathBenefit: 2301225, isExactFromIllustration: false },
  { year: 55, age: 98, premium: 3931, guaranteedCashValue: 532302, nonGuaranteedCashValue: 2196218, dividend: 72049, guaranteedDeathBenefit: 577746, nonGuaranteedDeathBenefit: 2364283, isExactFromIllustration: true },
];
