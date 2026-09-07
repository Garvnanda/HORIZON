// Two themes. Light = Azure (white base, blue primary, teal standout).
// Dark = Tactical (near-black base, gold primary, green standout).
// Red = threat, green = contained, in both.
//
// Charts and the WebGL scene read hex from here. PALETTE and SCENE are live:
// they resolve against the active theme at property-access time, so a chart's
// draw() picks up the current theme with no import change. Components that draw
// must still re-run on theme change - use useTheme() from '@/lib/theme'.

import { getTheme } from './theme'

export interface Pal {
  bg: string
  surface: string
  surface2: string
  ink: string
  inkDim: string
  inkFaint: string
  line: string
  lineStrong: string
  blue: string
  blueDeep: string
  blueSoft: string
  teal: string
  tealDeep: string
  threat: string
  threatSoft: string
  safe: string
  safeSoft: string
}

const LIGHT: Pal = {
  bg: '#f5f9fb',
  surface: '#ffffff',
  surface2: '#eef4f8',
  ink: '#10243a',
  inkDim: '#5b6b7d',
  inkFaint: '#9aa8b6',
  line: '#dbe7ef',
  lineStrong: '#c2d4e0',
  blue: '#1f6feb',
  blueDeep: '#1650b3',
  blueSoft: '#e8f1fe',
  teal: '#14b8a6',
  tealDeep: '#0e9384',
  threat: '#e5484d',
  threatSoft: '#fdecec',
  safe: '#2c7a4b',
  safeSoft: '#e7f4ec',
}

const DARK: Pal = {
  bg: '#0a0b0e',
  surface: '#15171c',
  surface2: '#1e2128',
  ink: '#ece3ce',
  inkDim: '#a49a80',
  inkFaint: '#6f6858',
  line: '#2b2f37',
  lineStrong: '#3c414b',
  blue: '#e0a53a', // gold primary
  blueDeep: '#b5822a',
  blueSoft: '#241e12',
  teal: '#57c98a', // bright green standout
  tealDeep: '#3f9e69',
  threat: '#f0594e',
  threatSoft: '#2a1512',
  safe: '#4ea86b',
  safeSoft: '#16241c',
}

export interface Scn {
  bg: string
  grid: string
  edgeIdle: string
  edgeHot: string
  nodeIdle: string
  nodeHot: string
  agent: string
  shield: string
  jewelIdle: string
  jewelSafe: string
  label: string
  labelHot: string
}

const SCENE_LIGHT: Scn = {
  bg: '#0b1424',
  grid: '#1c2c44',
  edgeIdle: '#26374f',
  edgeHot: '#ff9a4d',
  nodeIdle: '#4c8dff',
  nodeHot: '#ff8c42',
  agent: '#ff3b30',
  shield: '#2ee6c9',
  jewelIdle: '#2dd4bf',
  jewelSafe: '#34d399',
  label: '#9db4d0',
  labelHot: '#ffb27a',
}

const SCENE_DARK: Scn = {
  bg: '#07080b',
  grid: '#181b22',
  edgeIdle: '#2b3038',
  edgeHot: '#e0a53a',
  nodeIdle: '#3f7d5c',
  nodeHot: '#e0a53a',
  agent: '#f0594e',
  shield: '#57c98a',
  jewelIdle: '#4ea86b',
  jewelSafe: '#6fe0a3',
  label: '#8a9384',
  labelHot: '#f0c675',
}

function proxy<T extends object>(light: T, dark: T): T {
  return new Proxy(light, {
    get: (_t, k) => (getTheme() === 'dark' ? dark : light)[k as keyof T],
  })
}

export const PALETTE: Pal = proxy(LIGHT, DARK)
export const SCENE: Scn = proxy(SCENE_LIGHT, SCENE_DARK)

/** Snapshot of the active palette - use when you need a plain object (JSON, spread). */
export const activePalette = (): Pal => (getTheme() === 'dark' ? DARK : LIGHT)
export const activeScene = (): Scn => (getTheme() === 'dark' ? SCENE_DARK : SCENE_LIGHT)
