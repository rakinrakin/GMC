/** Units are km in scene space, the same as gmc_relief_test.blend. */
type V3 = [number, number, number];

export interface CamKey {
  t: number;
  pos: V3;
  target: V3;
  /** Vertical field of view in degrees (three.js PerspectiveCamera convention). */
  fov: number;
}

export interface ZoneDef {
  id: number;
  name: string;
  view: { pos: V3; target: V3; fov?: number };
  image?: string;
  copy: string;
}

export interface Limits {
  /** Radians around the start view. */
  azimuth: [number, number];
  /** Radians from vertical. */
  polar: [number, number];
  /** km from target. */
  distance: [number, number];
  /** Spring back to the start view after idle; null disables. */
  springBackMs: number | null;
}

const MAP_POS: V3 = [-6, -98, 125];
const MAP_TARGET: V3 = [-6, -4, 0];
const MAP_FOV = 30.6;

export const CONFIG: {
  timeline: CamKey[];
  limits: Limits;
  colors: { zone: string; plaster: string; mist: string; skyHorizon: string; skyZenith: string };
  fog: { near: number; far: number };
  clouds: { deck: number; breakup: number; veil: number };
  mobileCloudScale: number;
  zones: ZoneDef[];
  scrollVh: 4;
} = {
  timeline: [
    { t: 0, pos: [0, -70, 16.8], target: [0, 40, 14.6], fov: 39.8 },
    { t: 0.45, pos: [-4, -70, 30], target: [-4, -12, 0], fov: 37.3 },
    { t: 0.8, pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
    { t: 1, pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
  ],
  limits: {
    azimuth: [-0.6, 0.6],
    polar: [0.35, 1.05],
    distance: [60, 190],
    springBackMs: 6000,
  },
  colors: {
    zone: '#4A0E16',
    plaster: '#DCDCDA',
    mist: '#D6DCE6',
    skyHorizon: '#ECEEF2',
    skyZenith: '#7FA3D6',
  },
  fog: { near: 7, far: 32 },
  clouds: { deck: 460, breakup: 150, veil: 16 },
  mobileCloudScale: 0.5,
  // Generated from public/assets/zones.json (tools/build_maps.py): ids by descending area.
  zones: [
    {
      id: 1,
      name: 'Gelephu core',
      view: { pos: [8, -46, 14.5], target: [9.3, 4, 7.2], fov: 33.2 },
      image: 'assets/project_spire.webp',
      copy: 'Placeholder copy for Gelephu core.',
    },
    {
      id: 2,
      name: 'Zone 2',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 2.',
    },
    {
      id: 3,
      name: 'Zone 3',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 3.',
    },
    {
      id: 4,
      name: 'Zone 4',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 4.',
    },
    {
      id: 5,
      name: 'Zone 5',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 5.',
    },
    {
      id: 6,
      name: 'Zone 6',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 6.',
    },
    {
      id: 7,
      name: 'Zone 7',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 7.',
    },
    {
      id: 8,
      name: 'Zone 8',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 8.',
    },
    {
      id: 9,
      name: 'Zone 9',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 9.',
    },
    {
      id: 10,
      name: 'Zone 10',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 10.',
    },
    {
      id: 11,
      name: 'Zone 11',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 11.',
    },
    {
      id: 12,
      name: 'Zone 12',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 12.',
    },
    {
      id: 13,
      name: 'Zone 13',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 13.',
    },
    {
      id: 14,
      name: 'Zone 14',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 14.',
    },
    {
      id: 15,
      name: 'Zone 15',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 15.',
    },
    {
      id: 16,
      name: 'Zone 16',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 16.',
    },
    {
      id: 17,
      name: 'Zone 17',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 17.',
    },
    {
      id: 18,
      name: 'Zone 18',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 18.',
    },
    {
      id: 19,
      name: 'Zone 19',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 19.',
    },
    {
      id: 20,
      name: 'Zone 20',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 20.',
    },
    {
      id: 21,
      name: 'Zone 21',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 21.',
    },
    {
      id: 22,
      name: 'Zone 22',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 22.',
    },
    {
      id: 23,
      name: 'Zone 23',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 23.',
    },
    {
      id: 24,
      name: 'Zone 24',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 24.',
    },
    {
      id: 25,
      name: 'Zone 25',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 25.',
    },
    {
      id: 26,
      name: 'Zone 26',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 26.',
    },
    {
      id: 27,
      name: 'Zone 27',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 27.',
    },
    {
      id: 28,
      name: 'Zone 28',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 28.',
    },
    {
      id: 29,
      name: 'Zone 29',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 29.',
    },
    {
      id: 30,
      name: 'Zone 30',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 30.',
    },
    {
      id: 31,
      name: 'Zone 31',
      view: { pos: MAP_POS, target: MAP_TARGET, fov: MAP_FOV },
      copy: 'Placeholder copy for Zone 31.',
    },
  ],
  scrollVh: 4,
};
