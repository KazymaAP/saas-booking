'use client';
// шаблоны/_shared/glyph.tsx — единая точка маппинга IconKey → иконка phosphor.
// Все темы ссылаются на IconKey, а не на конкретные компоненты, поэтому добавить
// нишу = добавить строку в карту, не трогая сайт/визард.
import type { Icon } from '@phosphor-icons/react';
import {
  Car, Scissors, Tooth, Barbell, BookOpen, Camera, Scales, PawPrint, Broom, Wrench,
  Sparkle, Flower, Heart, Stethoscope, PaintBrush, Hammer, PenNib, Clock, ShieldCheck,
  CalendarCheck, Star, Users, Medal, Plant, Cpu, Baby, Dog, Cat, Drop,
} from '@phosphor-icons/react';
import type { IconKey } from './niche-tenant';

const MAP: Record<IconKey, Icon> = {
  car: Car, scissors: Scissors, tooth: Tooth, dumbbell: Barbell, book: BookOpen, camera: Camera,
  scales: Scales, paw: PawPrint, broom: Broom, wrench: Wrench, sparkle: Sparkle, flower: Flower,
  heart: Heart, stethoscope: Stethoscope, 'paint-brush': PaintBrush, drop: Drop, hammer: Hammer,
  'pen-nib': PenNib, clock: Clock, shield: ShieldCheck, calendar: CalendarCheck, star: Star,
  users: Users, medal: Medal, plant: Plant, cpu: Cpu, baby: Baby, dog: Dog, cat: Cat,
};

export function Glyph({
  icon,
  size = 20,
  weight = 'bold',
  className,
}: {
  icon: IconKey | string;
  size?: number;
  weight?: 'bold' | 'fill' | 'duotone' | 'light' | 'thin' | 'regular';
  className?: string;
}) {
  const Comp = (MAP[(icon as IconKey)] ?? Sparkle) as Icon;
  return <Comp size={size} weight={weight} className={className} aria-hidden="true" />;
}
