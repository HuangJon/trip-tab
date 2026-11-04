/**
 * Suggests a category from what someone typed. It runs on the phone, with no AI service or cost.
 * The group's own past expenses come first: if they called it "Family Mart" and filed it under
 * Groceries before, that wins. Then keywords, in English and common Chinese and Japanese words.
 * Order matters: earlier lists win, so "airport hotel" is Lodging and "wine bar" is Drinks.
 */
const KEYWORDS = [
  ['flights', ['flight', 'flights', 'airline', 'airfare', 'plane ticket', 'plane tickets', 'boarding pass', 'baggage', '機票', '航空', '飛機', '航空券']],
  ['lodging', ['hotel', 'hotels', 'hostel', 'airbnb', 'motel', 'inn', 'resort', 'lodging', 'room', 'rooms', 'villa', 'ryokan', 'guesthouse', 'booking', 'accommodation', 'deposit', '飯店', '旅館', '民宿', '住宿', '酒店', 'ホテル', '宿']],
  ['groceries', ['grocery', 'groceries', 'supermarket', 'market run', 'costco', 'trader joe', 'trader joes', 'whole foods', 'safeway', 'kroger', 'aldi', 'pxmart', 'family mart', 'familymart', '7-eleven', '7-11', '7eleven', 'lawson', 'convenience store', 'snacks', '超市', '便利商店', '全聯', '全家', 'コンビニ', 'スーパー']],
  ['drinks', ['beer', 'beers', 'wine', 'cocktail', 'cocktails', 'bar', 'bars', 'pub', 'drinks', 'sake', 'whisky', 'whiskey', 'coffee', 'cafe', 'latte', 'tea', 'boba', 'starbucks', '啤酒', '咖啡', '珍奶', '手搖', '飲料', '酒吧', 'ビール', 'コーヒー']],
  ['food', ['dinner', 'lunch', 'breakfast', 'brunch', 'meal', 'meals', 'food', 'restaurant', 'izakaya', 'ramen', 'sushi', 'pizza', 'burger', 'burgers', 'tacos', 'bbq', 'barbecue', 'noodles', 'hot pot', 'hotpot', 'dumplings', 'steak', 'night market', 'bakery', 'dessert', 'ice cream', 'takeout', 'mcdonalds', "mcdonald's", '晚餐', '午餐', '早餐', '吃', '餐', '小吃', '夜市', '火鍋', '拉麵', '壽司', 'ラーメン', '寿司', '居酒屋', 'ご飯']],
  ['transport', ['taxi', 'uber', 'lyft', 'grab', 'cab', 'train', 'bus', 'metro', 'subway', 'mrt', 'hsr', 'shinkansen', 'ferry', 'rental car', 'car rental', 'rental', 'gas', 'fuel', 'parking', 'toll', 'tolls', 'scooter', 'bike', 'transit', 'suica', '計程車', '高鐵', '火車', '捷運', '公車', '租車', '加油', '停車', 'タクシー', '電車', '新幹線']],
  ['activities', ['ticket', 'tickets', 'museum', 'tour', 'tours', 'aquarium', 'zoo', 'park', 'theme park', 'disney', 'concert', 'show', 'movie', 'hike', 'snorkel', 'snorkeling', 'diving', 'surf', 'surfing', 'ski', 'spa', 'massage', 'onsen', 'karaoke', 'admission', 'entrance', 'temple', '門票', '博物館', '水族館', '溫泉', '按摩', '唱歌', '温泉', '入場']],
  ['shopping', ['shopping', 'souvenir', 'souvenirs', 'gift', 'gifts', 'clothes', 'shoes', 'mall', 'duty free', 'uniqlo', '紀念品', '伴手禮', '禮物', '衣服', 'お土産']],
  ['fees', ['fee', 'fees', 'tip', 'tips', 'tax', 'visa', 'insurance', 'sim', 'esim', 'wifi', 'wi-fi', 'atm', 'service charge', '小費', '手續費', '保險', '網卡']],
];

const clean = text => String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
const isLatin = word => /^[\x00-\x7f]+$/.test(word);
const escapeRe = word => word.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');
/** English words match whole, so "bar" isn't found in "barber". Chinese and Japanese have no spaces to match on. */
const hasWord = (text, word) => (isLatin(word) ? new RegExp(`(^|[^a-z0-9])${escapeRe(word)}($|[^a-z0-9])`).test(text) : text.includes(word));

export function suggestCategory(description, pastEntries = []) {
  const text = clean(description);
  if (!text) return null;
  const same = pastEntries.filter(e => e.kind !== 'payment' && clean(e.desc) === text).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  if (same?.category) return same.category;
  for (const [category, words] of KEYWORDS) if (words.some(w => hasWord(text, w))) return category;
  return null;
}
