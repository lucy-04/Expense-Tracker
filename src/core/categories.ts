export type CategoryDef = { id: string; name: string; emoji: string };

/** Seeded on first launch; the user can rename/add/delete afterwards. */
export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { id: 'food-snacks', name: 'Food & Snacks', emoji: '🍪' },
  { id: 'groceries', name: 'Groceries', emoji: '🛒' },
  { id: 'food-delivery', name: 'Food Delivery', emoji: '🛵' },
  { id: 'shopping', name: 'Shopping', emoji: '🛍️' },
  { id: 'subscriptions', name: 'Subscriptions/Software', emoji: '💻' },
  { id: 'travel', name: 'Travel', emoji: '🚌' },
  { id: 'bills', name: 'Bills & Recharge', emoji: '💡' },
  { id: 'rent', name: 'Rent', emoji: '🏠' },
  { id: 'health', name: 'Health', emoji: '💊' },
  { id: 'entertainment', name: 'Entertainment', emoji: '🎬' },
  { id: 'cash', name: 'Cash', emoji: '💵' },
  { id: 'people', name: 'People', emoji: '👥' },
  { id: 'other', name: 'Other', emoji: '📦' },
];

export const UNCATEGORIZED_EMOJI = '❓';
export const CUSTOM_CATEGORY_EMOJI = '🏷️';

/** Icons for transactions that aren't spending, so they never need a category. */
export const TYPE_EMOJI = {
  expense: '🧾',
  income: '💰',
  refund: '↩️',
  transfer: '🔁',
  investment: '📈',
} as const;

/** Merchant keyword → category. First match wins, tested against the counterparty name. */
export const KEYWORD_RULES: { re: RegExp; categoryId: string }[] = [
  { re: /\b(SWIGGY|ZOMATO|EATSURE|EATCLUB)\b/, categoryId: 'food-delivery' },
  { re: /\b(MYNTRA|AJIO|AMAZON|FLIPKART|MEESHO|NYKAA|DECATHLON|CROMA|IKEA|TATACLIQ|UNIQLO|H M|ZARA)\b/, categoryId: 'shopping' },
  {
    re: /\b(ANTHROPIC|OPENAI|CHATGPT|CLAUDE|GITHUB|NETFLIX|SPOTIFY|YOUTUBE|GOOGLE|APPLE|HOTSTAR|JIOHOTSTAR|NOTION|CURSOR|VERCEL|MICROSOFT)\b/,
    categoryId: 'subscriptions',
  },
  {
    re: /\b(UBER|OLA|RAPIDO|IRCTC|REDBUS|MAKEMYTRIP|GOIBIBO|CLEARTRIP|INDIGO|AIR INDIA|METRO|FASTAG|PETROL|FUEL|HPCL|BPCL|INDIAN OIL)\b/,
    categoryId: 'travel',
  },
  { re: /\b(AIRTEL|JIO|VODAFONE|BSNL|ELECTRICITY|BESCOM|TATA POWER|RECHARGE|BROADBAND|BHARAT GAS|INDANE)\b/, categoryId: 'bills' },
  { re: /\b(PHARMA\w*|MEDICAL|MEDICOS?|APOLLO|1MG|PHARMEASY|NETMEDS|HOSPITAL|CLINIC|CHEMISTS?)\b/, categoryId: 'health' },
  { re: /\b(BOOKMYSHOW|PVR|INOX|STEAM|PLAYSTATION|DISTRICT)\b/, categoryId: 'entertainment' },
  { re: /\b(BLINKIT|ZEPTO|INSTAMART|BIGBASKET|DMART|STORES?|MART|SUPERMARKET|GENERAL|KIRANA|PROVISIONS?)\b/, categoryId: 'groceries' },
  {
    re: /\b(BAKE\w*|BAKERY|BITES|FOODS?|CAFE|RESTAURANT|CANTEEN|KHOVA|SWEETS|DHABA|TEA|COFFEE|JUICE|KITCHEN|MESS|CHAI|DOMINOS|PIZZA|BURGER|KFC|MCDONALDS)\b/,
    categoryId: 'food-snacks',
  },
];

/** Matched against the full narration; these decide the *type*, not the category. */
export const INVESTMENT_RE = /\b(SIP|MUTUAL FUND|ZERODHA|GROWW|UPSTOX|INDMONEY|KUVERA|COIN BY ZERODHA|NPS|PPF)\b/i;
