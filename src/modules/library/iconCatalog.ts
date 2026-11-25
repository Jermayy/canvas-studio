import {
  Award,
  Baby,
  Balloon,
  Bell,
  Briefcase,
  Building2,
  Cake,
  Calendar,
  Camera,
  ChartBar,
  Check,
  Clock,
  Coffee,
  Crown,
  Flame,
  Flower,
  Gem,
  Gift,
  Globe,
  Guitar,
  Handshake,
  Heart,
  Leaf,
  Lightbulb,
  Mail,
  MapPin,
  Martini,
  Medal,
  Megaphone,
  Mic,
  Moon,
  Music,
  Palmtree,
  PartyPopper,
  Phone,
  Plane,
  Presentation,
  Ribbon,
  Rocket,
  Smile,
  Snowflake,
  Sparkles,
  Star,
  Sun,
  Target,
  Ticket,
  TreePine,
  TrendingUp,
  Trophy,
  Users,
  Utensils,
  Wine,
  Zap,
  type IconNode,
} from 'lucide';

/**
 * Icons users can place on the canvas (Lucide, ISC licence). Stored in
 * documents by id, so ids must never be renamed.
 */

export const ICON_GROUPS = [
  'Celebration',
  'Seasonal',
  'Business',
  'Event details',
  'Symbols',
] as const;

export type IconGroup = (typeof ICON_GROUPS)[number];

export interface CatalogIcon {
  id: string;
  label: string;
  group: IconGroup;
  keywords: string;
  node: IconNode;
}

const icon = (
  id: string,
  label: string,
  group: IconGroup,
  node: IconNode,
  keywords = '',
): CatalogIcon => ({ id, label, group, node, keywords });

export const ICON_CATALOG: readonly CatalogIcon[] = [
  icon(
    'party-popper',
    'Party popper',
    'Celebration',
    PartyPopper,
    'confetti celebrate',
  ),
  icon('cake', 'Cake', 'Celebration', Cake, 'birthday dessert'),
  icon('gift', 'Gift', 'Celebration', Gift, 'present birthday christmas'),
  icon('balloon', 'Balloon', 'Celebration', Balloon, 'birthday party'),
  icon('sparkles', 'Sparkles', 'Celebration', Sparkles, 'shine magic'),
  icon('wine', 'Wine glass', 'Celebration', Wine, 'drinks toast'),
  icon('martini', 'Cocktail', 'Celebration', Martini, 'drinks bar'),
  icon('music', 'Music', 'Celebration', Music, 'song dance dj'),
  icon('guitar', 'Guitar', 'Celebration', Guitar, 'band live music'),
  icon('crown', 'Crown', 'Celebration', Crown, 'king queen vip'),
  icon('gem', 'Gem', 'Celebration', Gem, 'diamond ring wedding'),
  icon('baby', 'Baby', 'Celebration', Baby, 'shower newborn'),
  icon('smile', 'Smile', 'Celebration', Smile, 'happy face'),
  icon('tree-pine', 'Christmas tree', 'Seasonal', TreePine, 'xmas holiday'),
  icon('snowflake', 'Snowflake', 'Seasonal', Snowflake, 'winter christmas'),
  icon('bell', 'Bell', 'Seasonal', Bell, 'christmas jingle'),
  icon('ribbon', 'Ribbon', 'Seasonal', Ribbon, 'bow award'),
  icon('sun', 'Sun', 'Seasonal', Sun, 'summer day'),
  icon('moon', 'Moon', 'Seasonal', Moon, 'night evening'),
  icon('palmtree', 'Palm tree', 'Seasonal', Palmtree, 'beach summer tropical'),
  icon('flower', 'Flower', 'Seasonal', Flower, 'spring wedding garden'),
  icon('leaf', 'Leaf', 'Seasonal', Leaf, 'autumn nature'),
  icon('flame', 'Flame', 'Seasonal', Flame, 'fire hot bbq'),
  icon('briefcase', 'Briefcase', 'Business', Briefcase, 'work office'),
  icon('presentation', 'Presentation', 'Business', Presentation, 'slides talk'),
  icon('chart-bar', 'Bar chart', 'Business', ChartBar, 'results growth'),
  icon('trending-up', 'Trending up', 'Business', TrendingUp, 'growth results'),
  icon('target', 'Target', 'Business', Target, 'goal objective'),
  icon('lightbulb', 'Light bulb', 'Business', Lightbulb, 'idea innovation'),
  icon('rocket', 'Rocket', 'Business', Rocket, 'launch startup'),
  icon('handshake', 'Handshake', 'Business', Handshake, 'deal partner'),
  icon('building', 'Building', 'Business', Building2, 'office venue'),
  icon('users', 'People', 'Business', Users, 'team audience'),
  icon('megaphone', 'Megaphone', 'Business', Megaphone, 'announce marketing'),
  icon('mic', 'Microphone', 'Business', Mic, 'speaker talk keynote'),
  icon('trophy', 'Trophy', 'Business', Trophy, 'award winner'),
  icon('medal', 'Medal', 'Business', Medal, 'award prize'),
  icon('award', 'Award', 'Business', Award, 'badge prize'),
  icon('calendar', 'Calendar', 'Event details', Calendar, 'date day'),
  icon('clock', 'Clock', 'Event details', Clock, 'time'),
  icon('map-pin', 'Location', 'Event details', MapPin, 'venue address place'),
  icon('ticket', 'Ticket', 'Event details', Ticket, 'entry admission'),
  icon('utensils', 'Dining', 'Event details', Utensils, 'food dinner'),
  icon('coffee', 'Coffee', 'Event details', Coffee, 'break cafe'),
  icon('mail', 'Email', 'Event details', Mail, 'rsvp contact'),
  icon('phone', 'Phone', 'Event details', Phone, 'call contact'),
  icon('globe', 'Website', 'Event details', Globe, 'web online'),
  icon('camera', 'Camera', 'Event details', Camera, 'photo'),
  icon('plane', 'Plane', 'Event details', Plane, 'travel destination'),
  icon('star', 'Star', 'Symbols', Star, 'favourite rating'),
  icon('heart', 'Heart', 'Symbols', Heart, 'love wedding'),
  icon('check', 'Check', 'Symbols', Check, 'done tick yes'),
  icon('zap', 'Lightning', 'Symbols', Zap, 'energy fast'),
];

const BY_ID = new Map(ICON_CATALOG.map((entry) => [entry.id, entry]));

export function iconById(id: string): CatalogIcon | undefined {
  return BY_ID.get(id);
}

export function iconLabel(id: string): string {
  return iconById(id)?.label ?? 'Unknown';
}

export function searchIcons(term: string): CatalogIcon[] {
  const query = term.trim().toLowerCase();
  if (!query) {
    return [...ICON_CATALOG];
  }
  return ICON_CATALOG.filter((entry) =>
    `${entry.label} ${entry.keywords} ${entry.group}`
      .toLowerCase()
      .includes(query),
  );
}
