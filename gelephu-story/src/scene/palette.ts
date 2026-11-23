import * as THREE from 'three';
import { CONFIG } from '../config';

/**
 * One mist colour uniform shared by the sky's mist disc, the terrain's edge fade and its focus
 * fog: where the terrain ends it has already become exactly the colour of the mist beyond it.
 */
export const MIST_COLOR = { value: new THREE.Color(CONFIG.colors.mist) };

/** Height (three Y, km) of the mist plane; the terrain floor is clamped to it. */
export const MIST_HEIGHT = 0.37;
