/** Tunable values and lists. Nothing here touches the page or storage. */
export const SCHEMA_VERSION = 1;
export const APP_NAME = 'The Trip Tab';

/** Pictures someone can pick instead of their initial. */
export const AVATARS = ['🐼', '🐱', '🐶', '🦊', '🐻', '🐨', '🐯', '🦁', '🐸', '🐵', '🐧', '🐰', '🐙', '🦄', '🐢', '🐳'];
export const AVATAR_COLORS = 8;

/** Currencies that travelers normally pay without cents. */
export const ZERO_DECIMAL = new Set(['TWD', 'JPY', 'KRW', 'VND', 'IDR', 'CLP', 'ISK']);
export const CURRENCIES = ['USD', 'TWD', 'JPY', 'KRW', 'EUR', 'GBP', 'HKD', 'SGD', 'THB', 'VND', 'CNY', 'AUD', 'CAD', 'MXN', 'MYR', 'IDR', 'PHP', 'NZD', 'CHF'];
/** Default trip currency by device time zone. Anything else starts on USD. */
export const ZONE_CURRENCY = { 'Asia/Taipei': 'TWD', 'Asia/Tokyo': 'JPY', 'Asia/Seoul': 'KRW', 'Asia/Hong_Kong': 'HKD', 'Asia/Singapore': 'SGD', 'Europe/London': 'GBP' };

export const CATEGORIES = {
  food: 'Food', drinks: 'Drinks', lodging: 'Lodging', transport: 'Transport', flights: 'Flights',
  activities: 'Activities', groceries: 'Groceries', shopping: 'Shopping', fees: 'Fees & tips', other: 'Other',
};

export const LIMITS = {
  tripName: 60, personName: 40, description: 80, note: 500, comment: 300,
  activityShown: 200, snapshotsKept: 3, members: 50, itemsPerBill: 60,
  /** Receipt photos are stored inside the database, which caps one document at 1 MiB. */
  receiptMaxSide: 1200, receiptMaxChars: 700_000,
  backupNudgeDays: 14,
};
