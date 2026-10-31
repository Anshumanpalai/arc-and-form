export const initialCategories = [
  { name: 'Essentials', slug: 'essentials' },
  { name: 'Outerwear', slug: 'outerwear' },
  { name: 'Accessories', slug: 'accessories' },
  { name: 'Home & Desk', slug: 'home-and-desk' },
];

export const initialUsers = [
  {
    email: 'admin@arcandform.com',
    password: 'Admin@123!',
    name: 'Arc & Form Admin',
    role: 'ADMIN',
  },
  {
    email: 'customer@arcandform.com',
    password: 'Customer@123!',
    name: 'Demo Customer',
    role: 'CUSTOMER',
  },
];

export const initialProducts = [
  // 1. Essentials (5 products)
  {
    name: 'Heavyweight Organic Cotton Tee',
    slug: 'heavyweight-organic-cotton-tee',
    description: 'Crafted from 280 GSM combed organic cotton. Features a bound ribbed collar, dropped shoulder seams, and a tailored relaxed drape.',
    price: 42.0,
    stock: 24,
    featured: true,
    categorySlug: 'essentials',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    images: [
      'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=1200&q=80',
    ],
  },
  {
    name: 'Pima Crewneck Longsleeve',
    slug: 'pima-crewneck-longsleeve',
    description: 'Peruvian long-staple pima cotton jersey with reinforced flatlock seams and ribbed cuffs. Exceptionally soft with low pilling.',
    price: 54.0,
    stock: 18,
    featured: false,
    categorySlug: 'essentials',
    sizes: ['S', 'M', 'L', 'XL'],
    images: [
      'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?auto=format&fit=crop&w=1200&q=80',
    ],
  },
  {
    name: 'Raw Selvedge Denim Trouser',
    slug: 'raw-selvedge-denim-trouser',
    description: '13.5 oz Japanese Kurabo selvedge denim in an unwashed deep indigo. Mid-rise straight cut finished with antique copper rivets.',
    price: 135.0,
    stock: 12,
    featured: true,
    categorySlug: 'essentials',
    sizes: ['30', '32', '34', '36'],
    images: [
      'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=1200&q=80',
    ],
  },
  {
    name: 'Mercerized Boxy Overshirt',
    slug: 'mercerized-boxy-overshirt',
    description: 'High-density double-mercerized cotton poplin. Clean spread collar, concealed horn-button placket, and dual chest patch pockets.',
    price: 88.0,
    stock: 15,
    featured: false,
    categorySlug: 'essentials',
    sizes: ['S', 'M', 'L'],
    images: [
      'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=1200&q=80',
    ],
  },
  {
    name: 'Minimal French Terry Sweatshirt',
    slug: 'minimal-french-terry-sweatshirt',
    description: '400 GSM brushed loopback French terry with architectural raglan sleeves, ribbed side gussets, and seamless tubular hem.',
    price: 78.0,
    stock: 3,
    featured: false,
    categorySlug: 'essentials',
    sizes: ['S', 'M', 'L', 'XL'],
    images: [
      'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=1200&q=80',
    ],
  },

  // 2. Outerwear (5 products)
  {
    name: 'Structured Twill Trench',
    slug: 'structured-twill-trench',
    description: 'Weather-resistant compact cotton-nylon twill with storm flap, storm collar latch, and genuine buffalo horn buckles.',
    price: 148.0,
    stock: 8,
    featured: true,
    categorySlug: 'outerwear',
    sizes: ['38', '40', '42'],
    images: [
      'https://images.unsplash.com/photo-1544441893-675973e31985?auto=format&fit=crop&w=1200&q=80',
    ],
  },
  {
    name: 'Boiled Wool Chore Jacket',
    slug: 'boiled-wool-chore-jacket',
    description: '100% Austrian boiled virgin wool. Unlined for natural thermal regulation with three external patch pockets and horn buttons.',
    price: 142.0,
    stock: 2,
    featured: true,
    categorySlug: 'outerwear',
    sizes: ['S', 'M', 'L'],
    images: [
      'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=1200&q=80',
    ],
  },
  {
    name: 'Technical Shell Parka',
    slug: 'technical-shell-parka',
    description: 'Three-layer laminated recycled nylon membrane with taped seams, internal storm skirt, and waterproof matte YKK AquaGuard zips.',
    price: 150.0,
    stock: 0,
    featured: false,
    categorySlug: 'outerwear',
    sizes: ['S', 'M', 'L'],
    images: [
      'https://images.unsplash.com/photo-1548883354-7622d03aca27?auto=format&fit=crop&w=1200&q=80',
    ],
  },
  {
    name: 'Quilted Ripstop Overshirt',
    slug: 'quilted-ripstop-overshirt',
    description: 'Diamond-quilted matte micro-ripstop insulated with 60 GSM recycled PrimaLoft Gold. Lightweight, water-repellent, and packable.',
    price: 115.0,
    stock: 14,
    featured: false,
    categorySlug: 'outerwear',
    sizes: ['S', 'M', 'L', 'XL'],
    images: [
      'https://images.unsplash.com/photo-1578587018452-892bacefd3f2?auto=format&fit=crop&w=1200&q=80',
    ],
  },
  {
    name: 'Canvas Workwear Blouson',
    slug: 'canvas-workwear-blouson',
    description: 'Heavy 12 oz cotton duck canvas pre-washed for soft hand feel. Corduroy-faced collar and antique brass zip closure.',
    price: 128.0,
    stock: 9,
    featured: false,
    categorySlug: 'outerwear',
    sizes: ['M', 'L', 'XL'],
    images: [
      'https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=1200&q=80',
    ],
  },

  // 3. Accessories (5 products)
  {
    name: 'Vegetable Tanned Leather Cardholder',
    slug: 'vegetable-tanned-leather-cardholder',
    description: 'Full-grain Italian Tuscan vegetable-tanned leather. Features four card slots and central notes pocket with hand-burnished wax edges.',
    price: 38.0,
    stock: 35,
    featured: true,
    categorySlug: 'accessories',
    sizes: [],
    images: [
      'https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=1200&q=80',
    ],
  },
  {
    name: 'Matte Titanium Key Carabiner',
    slug: 'matte-titanium-key-carabiner',
    description: 'Machined grade-5 titanium alloy with sandblasted anodized finish and integrated stainless steel wire gate.',
    price: 28.0,
    stock: 40,
    featured: false,
    categorySlug: 'accessories',
    sizes: [],
    images: [
      'https://images.unsplash.com/photo-1608256246200-53e635b5b65f?auto=format&fit=crop&w=1200&q=80',
    ],
  },
  {
    name: 'Minimalist Nylon Crossbody Pack',
    slug: 'minimalist-nylon-crossbody-pack',
    description: 'Cordura 500D ballistic nylon shell with Fidlock magnetic V-buckle, waterproof zips, and an internal padded key leash.',
    price: 64.0,
    stock: 22,
    featured: true,
    categorySlug: 'accessories',
    sizes: [],
    images: [
      'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1200&q=80',
    ],
  },
  {
    name: 'Merino Wool Ribbed Beanie',
    slug: 'merino-wool-ribbed-beanie',
    description: 'Extra-fine 19.5 micron merino wool knitted in a compact 7-gauge 2x2 rib. Naturally temperature-regulating and itch-free.',
    price: 34.0,
    stock: 28,
    featured: false,
    categorySlug: 'accessories',
    sizes: ['One Size'],
    images: [
      'https://images.unsplash.com/photo-1576871337632-b9aef4c17ab9?auto=format&fit=crop&w=1200&q=80',
    ],
  },
  {
    name: 'Waxed Cotton Canvas Tote',
    slug: 'waxed-cotton-canvas-tote',
    description: '14 oz dry-waxed Scottish canvas with English bridle leather handles, solid copper rivets, and internal brass key clip.',
    price: 48.0,
    stock: 19,
    featured: false,
    categorySlug: 'accessories',
    sizes: [],
    images: [
      'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=1200&q=80',
    ],
  },

  // 4. Home & Desk (5 products)
  {
    name: 'Solid Walnut Desk Tray',
    slug: 'solid-walnut-desk-tray',
    description: 'Milled from a single block of FSC-certified American black walnut. Finished with natural plant oils and matte beeswax.',
    price: 52.0,
    stock: 16,
    featured: true,
    categorySlug: 'home-and-desk',
    sizes: [],
    images: [
      'https://images.unsplash.com/photo-1584992236310-6edddc08acff?auto=format&fit=crop&w=1200&q=80',
    ],
  },
  {
    name: 'Cast Iron Incense Burner',
    slug: 'cast-iron-incense-burner',
    description: 'Sand-cast raw iron with subtle tactile texture. Includes a solid brass dual-size incense holder insert.',
    price: 36.0,
    stock: 30,
    featured: false,
    categorySlug: 'home-and-desk',
    sizes: [],
    images: [
      'https://images.unsplash.com/photo-1602874801007-bd458bb1b8b8?auto=format&fit=crop&w=1200&q=80',
    ],
  },
  {
    name: 'Anodized Aluminum Pen Stand',
    slug: 'anodized-aluminum-pen-stand',
    description: 'Precision CNC-machined aerospace aluminum block with a micro-bead blasted surface and non-slip silicone base.',
    price: 24.0,
    stock: 45,
    featured: false,
    categorySlug: 'home-and-desk',
    sizes: [],
    images: [
      'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=1200&q=80',
    ],
  },
  {
    name: 'Stoneware Ceramic Tumbler',
    slug: 'stoneware-ceramic-tumbler',
    description: 'Wheel-thrown stoneware glazed in a matte oatmeal reactive mineral wash with an exposed raw clay grog foot.',
    price: 22.0,
    stock: 32,
    featured: false,
    categorySlug: 'home-and-desk',
    sizes: [],
    images: [
      'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=1200&q=80',
    ],
  },
  {
    name: 'Linen Bound Grid Journal',
    slug: 'linen-bound-grid-journal',
    description: '192 pages of 100 GSM acid-free fountain pen-friendly paper. Bound in tactile Belgian bookcloth linen with silk ribbon.',
    price: 26.0,
    stock: 50,
    featured: false,
    categorySlug: 'home-and-desk',
    sizes: [],
    images: [
      'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=1200&q=80',
    ],
  },
];

