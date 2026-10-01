/**
 * monthlyTrophies.ts — 12 unique monthly trophy definitions and theme metadata.
 *
 * Purpose:      Provide distinct visual identities, gemstone accents, and badge
 *               metadata for each month of the year (January through December).
 */

export interface MonthlyTrophyTheme {
  readonly month: number;
  readonly monthName: string;
  readonly shortName: string;
  readonly gemName: string;
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly accentColor: string;
  readonly iconSymbol: string;
}

export const MONTHLY_TROPHY_THEMES: readonly MonthlyTrophyTheme[] = [
  {
    month: 1,
    monthName: 'January',
    shortName: 'JAN',
    gemName: 'Garnet Frost',
    primaryColor: '#E11D48', // Rose Garnet
    secondaryColor: '#38BDF8', // Frost Blue
    accentColor: '#FFF1F2',
    iconSymbol: '💎',
  },
  {
    month: 2,
    monthName: 'February',
    shortName: 'FEB',
    gemName: 'Amethyst Violet',
    primaryColor: '#9333EA', // Amethyst Purple
    secondaryColor: '#F472B6', // Soft Violet
    accentColor: '#F3E8FF',
    iconSymbol: '💜',
  },
  {
    month: 3,
    monthName: 'March',
    shortName: 'MAR',
    gemName: 'Aquamarine Bloom',
    primaryColor: '#0EA5E9', // Aquamarine Cyan
    secondaryColor: '#10B981', // Emerald Mint
    accentColor: '#E0F2FE',
    iconSymbol: '☘️',
  },
  {
    month: 4,
    monthName: 'April',
    shortName: 'APR',
    gemName: 'Diamond Prism',
    primaryColor: '#64748B', // Diamond Slate
    secondaryColor: '#38BDF8', // Prism Cyan
    accentColor: '#F8FAFC',
    iconSymbol: '💠',
  },
  {
    month: 5,
    monthName: 'May',
    shortName: 'MAY',
    gemName: 'Emerald Laurel',
    primaryColor: '#059669', // Emerald Green
    secondaryColor: '#F59E0B', // Laurel Gold
    accentColor: '#ECFDF5',
    iconSymbol: '🌿',
  },
  {
    month: 6,
    monthName: 'June',
    shortName: 'JUN',
    gemName: 'Pearl Solstice',
    primaryColor: '#D97706', // Solstice Amber
    secondaryColor: '#06B6D4', // Pearl Cyan
    accentColor: '#FFFBEB',
    iconSymbol: '☀️',
  },
  {
    month: 7,
    monthName: 'July',
    shortName: 'JUL',
    gemName: 'Ruby Flame',
    primaryColor: '#DC2626', // Ruby Red
    secondaryColor: '#F97316', // Flame Orange
    accentColor: '#FEF2F2',
    iconSymbol: '🔥',
  },
  {
    month: 8,
    monthName: 'August',
    shortName: 'AUG',
    gemName: 'Peridot Sun',
    primaryColor: '#65A30D', // Peridot Lime
    secondaryColor: '#EAB308', // Sun Gold
    accentColor: '#F7FEE7',
    iconSymbol: '👑',
  },
  {
    month: 9,
    monthName: 'September',
    shortName: 'SEP',
    gemName: 'Sapphire Zenith',
    primaryColor: '#2563EB', // Sapphire Blue
    secondaryColor: '#38BDF8', // Sky Cyan
    accentColor: '#EFF6FF',
    iconSymbol: '🛡️',
  },
  {
    month: 10,
    monthName: 'October',
    shortName: 'OCT',
    gemName: 'Opal Autumn',
    primaryColor: '#EA580C', // Autumn Opal
    secondaryColor: '#F59E0B', // Ember Gold
    accentColor: '#FFEDD5',
    iconSymbol: '🎃',
  },
  {
    month: 11,
    monthName: 'November',
    shortName: 'NOV',
    gemName: 'Topaz Empire',
    primaryColor: '#D97706', // Topaz Bronze
    secondaryColor: '#B45309', // Amber Gold
    accentColor: '#FEF3C7',
    iconSymbol: '🏆',
  },
  {
    month: 12,
    monthName: 'December',
    shortName: 'DEC',
    gemName: 'Tanzanite Star',
    primaryColor: '#4F46E5', // Tanzanite Indigo
    secondaryColor: '#EC4899', // Winter Magenta
    accentColor: '#EEF2FF',
    iconSymbol: '❄️',
  },
];

export const MONTHLY_TROPHY_ASSETS: Record<number, { active: any; inactive: any }> = {
  1: { active: require('../../assets/monthly trophies/jan.webp'), inactive: require('../../assets/monthly trophies/jan lock.webp') },
  2: { active: require('../../assets/monthly trophies/fab.webp'), inactive: require('../../assets/monthly trophies/fab lock.webp') },
  3: { active: require('../../assets/monthly trophies/march.webp'), inactive: require('../../assets/monthly trophies/march lock.webp') },
  4: { active: require('../../assets/monthly trophies/aprail.webp'), inactive: require('../../assets/monthly trophies/Locked_championship_cup_on_base_202609042146.webp') },
  5: { active: require('../../assets/monthly trophies/may.webp'), inactive: require('../../assets/monthly trophies/may lock.webp') },
  6: { active: require('../../assets/monthly trophies/june.webp'), inactive: require('../../assets/monthly trophies/june lock.webp') },
  7: { active: require('../../assets/monthly trophies/july.webp'), inactive: require('../../assets/monthly trophies/july lock.webp') },
  8: { active: require('../../assets/monthly trophies/august.webp'), inactive: require('../../assets/monthly trophies/august lock.webp') },
  9: { active: require('../../assets/monthly trophies/sep.webp'), inactive: require('../../assets/monthly trophies/sep lock.webp') },
  10: { active: require('../../assets/monthly trophies/oct.webp'), inactive: require('../../assets/monthly trophies/oct lock.webp') },
  11: { active: require('../../assets/monthly trophies/nov.webp'), inactive: require('../../assets/monthly trophies/nov lock.webp') },
  12: { active: require('../../assets/monthly trophies/dec.webp'), inactive: require('../../assets/monthly trophies/dec lock.webp') },
};

export function getMonthlyTrophyTheme(month: number): MonthlyTrophyTheme {
  const normalized = Math.max(1, Math.min(12, month));
  return MONTHLY_TROPHY_THEMES[normalized - 1]!;
}

export function getMonthlyTrophyAsset(month: number, active: boolean) {
  const norm = Math.max(1, Math.min(12, month));
  const assets = MONTHLY_TROPHY_ASSETS[norm] ?? MONTHLY_TROPHY_ASSETS[1]!;
  return active ? assets.active : assets.inactive;
}
