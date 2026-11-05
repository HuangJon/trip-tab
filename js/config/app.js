/** Tunable values and lists. Nothing here touches the page or storage. */
export const SCHEMA_VERSION = 1;
export const APP_NAME = 'The Trip Tab';

export const AVATAR_COLORS = 12;

/** Currencies that travelers normally pay without cents. */
export const ZERO_DECIMAL = new Set(['TWD', 'JPY', 'KRW', 'VND', 'IDR', 'CLP', 'ISK']);
export const CURRENCIES = ['USD', 'TWD', 'JPY', 'KRW', 'EUR', 'GBP', 'HKD', 'SGD', 'THB', 'VND', 'CNY', 'AUD', 'CAD', 'MXN', 'MYR', 'IDR', 'PHP', 'NZD', 'CHF'];

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
