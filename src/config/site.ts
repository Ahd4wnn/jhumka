const env = import.meta.env;

const handle = (env.PUBLIC_INSTAGRAM_HANDLE || 'jhumka.in_').replace(/^@/, '');

export const SITE = {
  name: 'Jhumka',
  handle,
  tagline: 'Your story, styled by Jhumka',
  bio: 'Curated jewellery for every version of you.',
  description:
    'Jhumka is a curated jewellery label: gold-plated infinity, heart, tulip and moon & venus necklaces, pendants, bracelets and rings for every version of you.',
  titleSuffix: 'Jhumka | Gold-plated jewellery',
  lang: 'en-IN',
  locale: 'en_IN',
  currency: 'INR',
  country: 'IN',
  themeColor: '#7D46AB',
  /** Customer care phone: country code + number, digits only. */
  contactPhone: '916238193133',
  instagramUrl: `https://www.instagram.com/${handle}/`,
  keywords: [
    'gold plated necklace',
    'pendant necklace',
    'infinity necklace',
    'heart pendant necklace',
    'tulip necklace',
    'moon necklace',
    'minimal jewellery India',
    'jewellery gifts for her',
    'Jhumka jewellery',
  ],
} as const;

export const NAV = [
  { href: '/shop', label: 'Shop' },
  { href: '/#collections', label: 'Collections' },
  { href: '/#story', label: 'Our Story' },
  { href: '/#faq', label: 'FAQ' },
] as const;

// TODO(owner): confirm or edit these answers — they intentionally avoid promising
// delivery times, charges or return terms until you tell us what they are.
export const FAQS = [
  {
    q: 'How do I place an order?',
    a: 'Add the pieces you love to your bag, tap Checkout, enter your delivery details and pay securely. You get your order number straight away.',
  },
  {
    q: 'How do I pay?',
    a: 'Pay online with UPI, debit or credit cards, net banking or wallets. Payments are processed securely by Razorpay; we never see your card details.',
  },
  {
    q: 'How do I track my order?',
    a: 'Open Track order and enter your order number with the mobile number you used at checkout. Tracking details appear there once your order ships.',
  },
  {
    q: 'How do I care for gold-plated jewellery?',
    a: 'Put your jewellery on last and take it off first. Keep it away from perfume, lotions and water, wipe it gently with a soft dry cloth after wearing, and store each piece separately in a pouch or box to protect the plating.',
  },
  {
    q: 'Can I gift a piece to someone?',
    a: 'Of course. Enter the recipient’s name and address at checkout and add a note that it is a gift.',
  },
] as const;
