/**
 * ATELIER CMS — Analysis Types
 * Analyzers are read-only observers — they never produce patches.
 */

export interface ABCDEResult {
  C1: number
  C2: number
  C3: number
  C4: number
  C5: number
  signals:     ABCDESignals
  dominant:    ABCDEKey | null
  isBalanced:  boolean
  /** Block IDs grouped by primary contributing dimension — used for canvas highlight on hover. */
  blocksByDim: Record<ABCDEKey, string[]>
}

export interface ABCDESignals {
  C1: number
  C2: number
  C3: number
  C4: number
  C5: number
}

export type ABCDEKey = keyof ABCDESignals
