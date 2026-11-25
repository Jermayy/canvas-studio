import {
  FORMATS,
  type CategoryId,
  type FormatId,
} from '@/modules/document/domain/catalog';
import {
  createDocument,
  createIcon,
  createLine,
  createShape,
  createText,
  type TextOptions,
} from '@/modules/document/domain/elementFactory';
import type {
  DesignDocument,
  DesignElement,
  Fill,
  ShapeElement,
} from '@/modules/document/domain/schema';

/**
 * Starter designs. Each template is a recipe rather than a stored document
 * so every new design gets fresh element ids.
 */

export interface Template {
  id: string;
  name: string;
  category: CategoryId;
  formatId: FormatId;
  description: string;
  build: (createId: () => string) => {
    background: Fill;
    elements: DesignElement[];
  };
}

/** Small DSL so templates read as layouts rather than object literals. */
function kit(createId: () => string) {
  return {
    text: (options: TextOptions) => createText(createId(), options),
    shape: (
      shape: ShapeElement['shape'],
      options: Parameters<typeof createShape>[2],
    ) => createShape(createId(), shape, options),
    icon: (icon: string, options: Parameters<typeof createIcon>[2]) =>
      createIcon(createId(), icon, options),
    line: (options: Parameters<typeof createLine>[1]) =>
      createLine(createId(), options),
  };
}

const centred = (width: number, margin: number) => ({
  x: margin,
  width: width - margin * 2,
  align: 'center' as const,
});

export const TEMPLATES: readonly Template[] = [
  {
    id: 'birthday-thirty',
    name: 'Thirty & Thriving',
    category: 'birthday',
    formatId: 'portrait',
    description: 'Elegant milestone birthday invite in violet and gold.',
    build: (createId) => {
      const k = kit(createId);
      const row = centred(1080, 90);
      return {
        background: {
          kind: 'linear',
          from: '#1e1b4b',
          to: '#5b21b6',
          angle: 160,
        },
        elements: [
          k.shape('ellipse', {
            name: 'Gold ring',
            x: 190,
            y: 200,
            width: 700,
            height: 700,
            fill: { kind: 'none' },
            stroke: { color: '#fbbf24', width: 4, dash: 'solid' },
            opacity: 0.6,
          }),
          k.icon('sparkles', {
            name: 'Sparkle top',
            x: 200,
            y: 190,
            width: 90,
            height: 90,
            color: '#fcd34d',
          }),
          k.icon('sparkles', {
            name: 'Sparkle side',
            x: 820,
            y: 760,
            width: 64,
            height: 64,
            color: '#fcd34d',
          }),
          k.text({
            ...row,
            y: 330,
            text: 'You’re invited to celebrate',
            fontSize: 30,
            fontWeight: 600,
            letterSpacing: 6,
            uppercase: true,
            color: '#fcd34d',
          }),
          k.text({
            ...row,
            y: 390,
            text: 'Thirty',
            fontFamily: 'didot',
            fontSize: 230,
            italic: true,
            color: '#ffffff',
            lineHeight: 1,
          }),
          k.text({
            ...row,
            y: 620,
            text: '& Thriving',
            fontFamily: 'script',
            fontSize: 104,
            color: '#fbbf24',
            lineHeight: 1.1,
          }),
          k.line({
            name: 'Divider',
            x: 440,
            y: 950,
            width: 200,
            height: 12,
            color: '#fbbf24',
            strokeWidth: 3,
          }),
          k.text({
            ...row,
            y: 990,
            text: 'Saturday 14 March · 7 PM',
            fontSize: 44,
            fontWeight: 600,
            color: '#ffffff',
          }),
          k.text({
            ...row,
            y: 1056,
            text: 'The Glasshouse, 12 Harbour Street',
            fontSize: 30,
            color: '#ddd6fe',
          }),
          k.text({
            ...row,
            y: 1210,
            text: 'RSVP by 1 March · hello@example.com',
            fontSize: 24,
            letterSpacing: 2,
            color: '#c4b5fd',
          }),
        ],
      };
    },
  },
  {
    id: 'birthday-kids',
    name: 'Party Time!',
    category: 'birthday',
    formatId: 'square',
    description: 'Bright, playful kids’ party with balloons and a badge.',
    build: (createId) => {
      const k = kit(createId);
      const balloon = (
        x: number,
        y: number,
        color: string,
        name: string,
      ): DesignElement[] => [
        k.line({
          name: `${name} string`,
          x: x + 35,
          y: y + 150,
          width: 140,
          height: 12,
          color: '#78716c',
          strokeWidth: 2,
          rotation: 80,
        }),
        k.shape('ellipse', {
          name,
          x,
          y,
          width: 130,
          height: 160,
          fill: { kind: 'solid', color },
        }),
      ];
      return {
        background: { kind: 'solid', color: '#fef3c7' },
        elements: [
          k.shape('ellipse', {
            name: 'Sun blob',
            x: -160,
            y: 620,
            width: 620,
            height: 620,
            fill: { kind: 'solid', color: '#fde68a' },
          }),
          ...balloon(90, 90, '#f43f5e', 'Red balloon'),
          ...balloon(230, 50, '#3b82f6', 'Blue balloon'),
          ...balloon(820, 110, '#22c55e', 'Green balloon'),
          k.text({
            ...centred(1080, 80),
            y: 330,
            text: 'Leo turns',
            fontFamily: 'rounded',
            fontSize: 96,
            fontWeight: 800,
            color: '#1e3a8a',
            lineHeight: 1,
          }),
          k.text({
            ...centred(1080, 80),
            y: 430,
            text: '5!',
            fontFamily: 'rounded',
            fontSize: 260,
            fontWeight: 800,
            color: '#e11d48',
            lineHeight: 1,
          }),
          k.shape('burst', {
            name: 'Badge',
            x: 760,
            y: 560,
            width: 230,
            height: 230,
            fill: { kind: 'solid', color: '#8b5cf6' },
            rotation: 12,
          }),
          k.text({
            name: 'Badge text',
            x: 780,
            y: 635,
            width: 190,
            text: 'Dino party!',
            fontFamily: 'rounded',
            fontSize: 34,
            fontWeight: 800,
            align: 'center',
            color: '#ffffff',
            rotation: 12,
          }),
          k.text({
            ...centred(1080, 120),
            y: 760,
            text: 'Sunday 9 Feb · 11 AM – 2 PM',
            fontFamily: 'rounded',
            fontSize: 44,
            fontWeight: 700,
            color: '#1e3a8a',
          }),
          k.text({
            ...centred(1080, 120),
            y: 830,
            text: 'Centennial Park playground',
            fontFamily: 'rounded',
            fontSize: 34,
            color: '#334155',
          }),
          k.icon('party-popper', {
            x: 120,
            y: 900,
            width: 110,
            height: 110,
            color: '#f97316',
          }),
          k.icon('cake', {
            x: 860,
            y: 880,
            width: 110,
            height: 110,
            color: '#e11d48',
          }),
        ],
      };
    },
  },
  {
    id: 'christmas-dinner',
    name: 'Festive Dinner',
    category: 'christmas',
    formatId: 'a4',
    description: 'Classic green and gold Christmas dinner poster.',
    build: (createId) => {
      const k = kit(createId);
      const flakes: [number, number, number][] = [
        [60, 70, 56],
        [640, 90, 72],
        [110, 860, 64],
        [660, 760, 48],
        [380, 40, 40],
        [700, 980, 60],
      ];
      return {
        background: { kind: 'solid', color: '#14532d' },
        elements: [
          ...flakes.map(([x, y, size]) =>
            k.icon('snowflake', {
              name: 'Snowflake',
              x,
              y,
              width: size,
              height: size,
              color: '#ffffff',
              opacity: 0.35,
            }),
          ),
          k.shape('rectangle', {
            name: 'Gold frame',
            x: 40,
            y: 40,
            width: 714,
            height: 1043,
            fill: { kind: 'none' },
            stroke: { color: '#fbbf24', width: 2, dash: 'solid' },
          }),
          k.icon('tree-pine', {
            x: 337,
            y: 150,
            width: 120,
            height: 120,
            color: '#fbbf24',
          }),
          k.text({
            ...centred(794, 60),
            y: 300,
            text: 'Christmas',
            fontFamily: 'script',
            fontSize: 120,
            color: '#fde68a',
            lineHeight: 1.1,
          }),
          k.text({
            ...centred(794, 60),
            y: 450,
            text: 'Dinner party',
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: 10,
            uppercase: true,
            color: '#ffffff',
          }),
          k.shape('rectangle', {
            name: 'Details card',
            x: 137,
            y: 560,
            width: 520,
            height: 300,
            cornerRadius: 20,
            fill: { kind: 'solid', color: '#fefce8' },
          }),
          k.text({
            ...centred(794, 170),
            y: 600,
            text: 'Thursday 25 December',
            fontFamily: 'garamond',
            fontSize: 40,
            color: '#14532d',
          }),
          k.text({
            ...centred(794, 170),
            y: 660,
            text: 'Drinks 5 PM · Dinner 6:30 PM',
            fontSize: 24,
            fontWeight: 600,
            color: '#166534',
          }),
          k.line({
            name: 'Card divider',
            x: 317,
            y: 712,
            width: 160,
            height: 12,
            color: '#ca8a04',
            strokeWidth: 2,
          }),
          k.text({
            ...centred(794, 170),
            y: 740,
            text: '42 Holly Lane, Hobart\nBring your favourite dessert',
            fontSize: 22,
            color: '#365314',
            lineHeight: 1.5,
          }),
          k.text({
            ...centred(794, 60),
            y: 960,
            text: 'Merry & bright',
            fontFamily: 'didot',
            fontSize: 30,
            italic: true,
            color: '#fde68a',
          }),
        ],
      };
    },
  },
  {
    id: 'christmas-office',
    name: 'Office Holiday Party',
    category: 'christmas',
    formatId: 'square',
    description: 'Bold red end-of-year party for teams.',
    build: (createId) => {
      const k = kit(createId);
      return {
        background: {
          kind: 'linear',
          from: '#b91c1c',
          to: '#7f1d1d',
          angle: 180,
        },
        elements: [
          k.shape('rectangle', {
            name: 'Ribbon vertical',
            x: 760,
            y: 0,
            width: 70,
            height: 1080,
            fill: { kind: 'solid', color: '#fbbf24' },
            opacity: 0.9,
          }),
          k.shape('rectangle', {
            name: 'Ribbon horizontal',
            x: 0,
            y: 160,
            width: 1080,
            height: 70,
            fill: { kind: 'solid', color: '#fbbf24' },
            opacity: 0.9,
          }),
          k.icon('gift', {
            x: 720,
            y: 110,
            width: 150,
            height: 150,
            color: '#ffffff',
            strokeWidth: 1.5,
          }),
          k.text({
            x: 90,
            y: 330,
            width: 900,
            text: 'Holiday\nParty',
            fontFamily: 'futura',
            fontSize: 170,
            fontWeight: 800,
            color: '#ffffff',
            lineHeight: 0.95,
          }),
          k.text({
            x: 96,
            y: 680,
            width: 800,
            text: 'Celebrating a big year, together.',
            fontSize: 40,
            color: '#fecaca',
          }),
          k.icon('calendar', {
            x: 96,
            y: 800,
            width: 52,
            height: 52,
            color: '#fbbf24',
          }),
          k.text({
            x: 170,
            y: 805,
            width: 700,
            text: 'Friday 19 December · from 4 PM',
            fontSize: 36,
            fontWeight: 600,
            color: '#ffffff',
          }),
          k.icon('map-pin', {
            x: 96,
            y: 880,
            width: 52,
            height: 52,
            color: '#fbbf24',
          }),
          k.text({
            x: 170,
            y: 885,
            width: 700,
            text: 'Level 12 rooftop terrace',
            fontSize: 36,
            fontWeight: 600,
            color: '#ffffff',
          }),
        ],
      };
    },
  },
  {
    id: 'wedding-save-the-date',
    name: 'Save the Date',
    category: 'wedding',
    formatId: 'invite',
    description: 'Minimal ivory card with a fine gold frame.',
    build: (createId) => {
      const k = kit(createId);
      const row = centred(480, 50);
      return {
        background: { kind: 'solid', color: '#fdf8f3' },
        elements: [
          k.shape('rectangle', {
            name: 'Outer frame',
            x: 22,
            y: 22,
            width: 436,
            height: 628,
            fill: { kind: 'none' },
            stroke: { color: '#b08d57', width: 1.5, dash: 'solid' },
          }),
          k.shape('rectangle', {
            name: 'Inner frame',
            x: 32,
            y: 32,
            width: 416,
            height: 608,
            fill: { kind: 'none' },
            stroke: { color: '#b08d57', width: 0.75, dash: 'solid' },
          }),
          k.text({
            ...row,
            y: 110,
            text: 'Save the date',
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: 6,
            uppercase: true,
            color: '#8b6f47',
          }),
          k.text({
            ...row,
            y: 190,
            text: 'Amelia\n&\nJames',
            fontFamily: 'script',
            fontSize: 62,
            color: '#3f3a36',
            lineHeight: 1.05,
          }),
          k.icon('heart', {
            x: 228,
            y: 420,
            width: 24,
            height: 24,
            color: '#b08d57',
            strokeWidth: 1.5,
          }),
          k.text({
            ...row,
            y: 470,
            text: '20 · 06 · 2027',
            fontFamily: 'didot',
            fontSize: 34,
            color: '#3f3a36',
          }),
          k.text({
            ...row,
            y: 530,
            text: 'Byron Bay, New South Wales',
            fontSize: 14,
            letterSpacing: 2,
            color: '#8b6f47',
          }),
          k.text({
            ...row,
            y: 580,
            text: 'Formal invitation to follow',
            fontFamily: 'garamond',
            fontSize: 15,
            italic: true,
            color: '#8b6f47',
          }),
        ],
      };
    },
  },
  {
    id: 'corporate-town-hall',
    name: 'Quarterly Town Hall',
    category: 'corporate',
    formatId: 'slide',
    description: 'Dark title slide for all-hands and town halls.',
    build: (createId) => {
      const k = kit(createId);
      const detail = (
        iconId: string,
        label: string,
        x: number,
      ): DesignElement[] => [
        k.icon(iconId, { x, y: 820, width: 44, height: 44, color: '#818cf8' }),
        k.text({
          x: x + 64,
          y: 824,
          width: 380,
          text: label,
          fontSize: 30,
          fontWeight: 500,
          color: '#e2e8f0',
        }),
      ];
      return {
        background: { kind: 'solid', color: '#0f172a' },
        elements: [
          k.shape('ellipse', {
            name: 'Glow large',
            x: 1180,
            y: -220,
            width: 980,
            height: 980,
            fill: {
              kind: 'linear',
              from: '#6366f1',
              to: '#0f172a',
              angle: 200,
            },
            opacity: 0.55,
          }),
          k.shape('ellipse', {
            name: 'Glow small',
            x: 1500,
            y: 640,
            width: 520,
            height: 520,
            fill: {
              kind: 'linear',
              from: '#06b6d4',
              to: '#0f172a',
              angle: 220,
            },
            opacity: 0.45,
          }),
          k.shape('rectangle', {
            name: 'Accent bar',
            x: 160,
            y: 300,
            width: 120,
            height: 10,
            cornerRadius: 5,
            fill: { kind: 'solid', color: '#818cf8' },
          }),
          k.text({
            x: 160,
            y: 340,
            width: 1300,
            text: 'Q3 Town Hall',
            fontFamily: 'helvetica',
            fontSize: 150,
            fontWeight: 800,
            letterSpacing: -3,
            color: '#ffffff',
            lineHeight: 1,
          }),
          k.text({
            x: 164,
            y: 520,
            width: 1200,
            text: 'Results, roadmap and recognition',
            fontSize: 52,
            color: '#94a3b8',
          }),
          ...detail('calendar', 'Thursday 2 October', 164),
          ...detail('clock', '10:00 – 11:30 AEST', 664),
          ...detail('map-pin', 'Auditorium & online', 1124),
        ],
      };
    },
  },
  {
    id: 'corporate-awards',
    name: 'Excellence Awards',
    category: 'corporate',
    formatId: 'a4',
    description: 'Black-tie awards night poster in black and gold.',
    build: (createId) => {
      const k = kit(createId);
      const row = centred(794, 70);
      return {
        background: {
          kind: 'linear',
          from: '#1c1917',
          to: '#0c0a09',
          angle: 180,
        },
        elements: [
          k.shape('burst', {
            name: 'Halo',
            x: 237,
            y: 120,
            width: 320,
            height: 320,
            fill: {
              kind: 'linear',
              from: '#fbbf24',
              to: '#92400e',
              angle: 160,
            },
            opacity: 0.25,
          }),
          k.icon('trophy', {
            x: 317,
            y: 200,
            width: 160,
            height: 160,
            color: '#fbbf24',
            strokeWidth: 1.5,
          }),
          k.text({
            ...row,
            y: 480,
            text: 'The 2027',
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: 8,
            uppercase: true,
            color: '#d6d3d1',
          }),
          k.text({
            ...row,
            y: 530,
            text: 'Excellence\nAwards',
            fontFamily: 'didot',
            fontSize: 92,
            color: '#fbbf24',
            lineHeight: 1,
          }),
          k.line({
            name: 'Divider',
            x: 337,
            y: 760,
            width: 120,
            height: 12,
            color: '#fbbf24',
            strokeWidth: 2,
          }),
          k.text({
            ...row,
            y: 800,
            text: 'Friday 5 November · 7 PM',
            fontSize: 30,
            fontWeight: 600,
            color: '#ffffff',
          }),
          k.text({
            ...row,
            y: 850,
            text: 'Grand Ballroom, Park Hyatt Melbourne',
            fontSize: 22,
            color: '#a8a29e',
          }),
          k.text({
            ...row,
            y: 1010,
            text: 'Black tie · RSVP to events@example.com',
            fontSize: 18,
            letterSpacing: 2,
            color: '#a8a29e',
          }),
        ],
      };
    },
  },
  {
    id: 'conference-speaker',
    name: 'Speaker Announcement',
    category: 'conference',
    formatId: 'square',
    description: 'Social card to announce a keynote speaker.',
    build: (createId) => {
      const k = kit(createId);
      return {
        background: { kind: 'solid', color: '#0b1120' },
        elements: [
          k.shape('ellipse', {
            name: 'Glow',
            x: 480,
            y: -200,
            width: 800,
            height: 800,
            fill: {
              kind: 'linear',
              from: '#22d3ee',
              to: '#0b1120',
              angle: 220,
            },
            opacity: 0.5,
          }),
          k.shape('rectangle', {
            name: 'Tag',
            x: 80,
            y: 90,
            width: 250,
            height: 56,
            cornerRadius: 28,
            fill: { kind: 'solid', color: '#22d3ee' },
          }),
          k.text({
            name: 'Tag text',
            x: 80,
            y: 103,
            width: 250,
            text: 'Keynote speaker',
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 2,
            uppercase: true,
            align: 'center',
            color: '#0b1120',
          }),
          k.shape('ellipse', {
            name: 'Photo frame',
            x: 600,
            y: 230,
            width: 380,
            height: 380,
            fill: {
              kind: 'linear',
              from: '#1e293b',
              to: '#334155',
              angle: 160,
            },
            stroke: { color: '#22d3ee', width: 6, dash: 'solid' },
          }),
          k.icon('users', {
            name: 'Photo placeholder',
            x: 730,
            y: 360,
            width: 120,
            height: 120,
            color: '#64748b',
          }),
          k.text({
            x: 80,
            y: 660,
            width: 920,
            text: 'Dr. Maya Chen',
            fontFamily: 'avenir',
            fontSize: 92,
            fontWeight: 700,
            letterSpacing: -2,
            color: '#ffffff',
          }),
          k.text({
            x: 84,
            y: 780,
            width: 900,
            text: 'Head of AI Research, Northwind Labs',
            fontSize: 36,
            color: '#94a3b8',
          }),
          k.line({
            name: 'Rule',
            x: 84,
            y: 880,
            width: 912,
            height: 12,
            color: '#1e293b',
            strokeWidth: 2,
          }),
          k.text({
            x: 84,
            y: 920,
            width: 600,
            text: 'DevSummit 2027 · Sydney',
            fontSize: 30,
            fontWeight: 600,
            color: '#22d3ee',
          }),
          k.text({
            x: 640,
            y: 920,
            width: 356,
            text: '12–13 August',
            fontSize: 30,
            align: 'right',
            color: '#e2e8f0',
          }),
        ],
      };
    },
  },
  {
    id: 'conference-banner',
    name: 'Summit Banner',
    category: 'conference',
    formatId: 'banner',
    description: 'Wide web banner for event pages and socials.',
    build: (createId) => {
      const k = kit(createId);
      return {
        background: {
          kind: 'linear',
          from: '#4f46e5',
          to: '#06b6d4',
          angle: 100,
        },
        elements: [
          k.shape('hexagon', {
            name: 'Hexagon',
            x: 1150,
            y: 60,
            width: 420,
            height: 380,
            fill: { kind: 'solid', color: '#ffffff' },
            opacity: 0.12,
          }),
          k.icon('rocket', {
            x: 1230,
            y: 150,
            width: 200,
            height: 200,
            color: '#ffffff',
            strokeWidth: 1.5,
          }),
          k.text({
            x: 100,
            y: 110,
            width: 1000,
            text: 'Product Summit 2027',
            fontFamily: 'avenir',
            fontSize: 96,
            fontWeight: 800,
            letterSpacing: -2,
            color: '#ffffff',
          }),
          k.text({
            x: 104,
            y: 240,
            width: 900,
            text: 'Two days of talks, workshops and launches.',
            fontSize: 36,
            color: '#e0e7ff',
          }),
          k.shape('rectangle', {
            name: 'Button',
            x: 104,
            y: 330,
            width: 280,
            height: 64,
            cornerRadius: 32,
            fill: { kind: 'solid', color: '#ffffff' },
          }),
          k.text({
            name: 'Button text',
            x: 104,
            y: 347,
            width: 280,
            text: 'Get tickets',
            fontSize: 26,
            fontWeight: 700,
            align: 'center',
            color: '#4338ca',
          }),
        ],
      };
    },
  },
  {
    id: 'party-rooftop',
    name: 'Rooftop Summer Party',
    category: 'party',
    formatId: 'story',
    description: 'Sunset gradient story for summer events.',
    build: (createId) => {
      const k = kit(createId);
      const row = centred(1080, 80);
      return {
        background: {
          kind: 'linear',
          from: '#f97316',
          to: '#be185d',
          angle: 180,
        },
        elements: [
          k.shape('ellipse', {
            name: 'Sun',
            x: 240,
            y: 220,
            width: 600,
            height: 600,
            fill: {
              kind: 'linear',
              from: '#fde68a',
              to: '#fb923c',
              angle: 180,
            },
          }),
          k.shape('rectangle', {
            name: 'Horizon',
            x: 0,
            y: 640,
            width: 1080,
            height: 1280,
            fill: {
              kind: 'linear',
              from: '#db2777',
              to: '#831843',
              angle: 180,
            },
          }),
          k.icon('palmtree', {
            x: 80,
            y: 440,
            width: 220,
            height: 220,
            color: '#831843',
            strokeWidth: 2.5,
          }),
          k.text({
            ...row,
            y: 760,
            text: 'Rooftop',
            fontFamily: 'display',
            fontSize: 230,
            uppercase: true,
            color: '#ffffff',
            lineHeight: 1,
          }),
          k.text({
            ...row,
            y: 990,
            text: 'Summer Party',
            fontFamily: 'script',
            fontSize: 120,
            color: '#fde68a',
          }),
          k.icon('music', {
            x: 330,
            y: 1240,
            width: 60,
            height: 60,
            color: '#fde68a',
          }),
          k.text({
            x: 410,
            y: 1248,
            width: 500,
            text: 'Live DJ till late',
            fontSize: 40,
            fontWeight: 600,
            color: '#ffffff',
          }),
          k.icon('martini', {
            x: 330,
            y: 1340,
            width: 60,
            height: 60,
            color: '#fde68a',
          }),
          k.text({
            x: 410,
            y: 1348,
            width: 500,
            text: 'Sunset cocktails',
            fontSize: 40,
            fontWeight: 600,
            color: '#ffffff',
          }),
          k.text({
            ...row,
            y: 1560,
            text: 'Sat 17 January · 6 PM',
            fontSize: 54,
            fontWeight: 700,
            color: '#ffffff',
          }),
          k.text({
            ...row,
            y: 1650,
            text: 'The Terrace, 88 Ocean Parade',
            fontSize: 38,
            color: '#fbcfe8',
          }),
        ],
      };
    },
  },
];

export function templateById(id: string): Template | undefined {
  return TEMPLATES.find((template) => template.id === id);
}

export function documentFromTemplate(
  template: Template,
  input: { id: string; now: string; createId: () => string },
): DesignDocument {
  const format =
    FORMATS.find((entry) => entry.id === template.formatId) ?? FORMATS[0];
  const { background, elements } = template.build(input.createId);
  return createDocument({
    id: input.id,
    name: template.name,
    category: template.category,
    format: { id: format.id, width: format.width, height: format.height },
    background,
    elements,
    now: input.now,
  });
}

export function blankDocument(input: {
  id: string;
  now: string;
  formatId: FormatId;
  name?: string;
}): DesignDocument {
  const format =
    FORMATS.find((entry) => entry.id === input.formatId) ?? FORMATS[0];
  return createDocument({
    id: input.id,
    name: input.name ?? `Untitled ${format.label.toLowerCase()}`,
    category: 'blank',
    format: { id: format.id, width: format.width, height: format.height },
    now: input.now,
  });
}

const previews = new Map<string, DesignDocument>();
const PREVIEW_DATE = '2026-01-01T00:00:00.000Z';

/** A stable, cached document for rendering a template thumbnail. */
export function templatePreview(template: Template): DesignDocument {
  const cached = previews.get(template.id);
  if (cached) {
    return cached;
  }
  let counter = 0;
  const document = documentFromTemplate(template, {
    id: `preview-${template.id}`,
    now: PREVIEW_DATE,
    createId: () => {
      counter += 1;
      return `${template.id}-${counter}`;
    },
  });
  previews.set(template.id, document);
  return document;
}
