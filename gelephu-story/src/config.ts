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
    { t: 0.8, pos: MAP_POS, target: MAP_TARGET, fov: 30.6 },
    { t: 1, pos: MAP_POS, target: MAP_TARGET, fov: 30.6 },
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
      view: { pos: MAP_POS, target: MAP_TARGET },
      copy: 'Placeholder copy for Zone 2.',
    },
    {
      id: 3,
      name: 'Zone 3',
      view: { pos: MAP_POS, target: MAP_TARGET },
      copy: 'Placeholder copy for Zone 3.',
    },
  ],
  scrollVh: 4,
};
