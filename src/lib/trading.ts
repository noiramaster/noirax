// Trading module: shared types, risk profiles and hard caps.
// The hard caps below are SYSTEM limits — users cannot exceed them even in
// advanced mode. They follow standard risk-management practice (see README
// / summary of the phase for the rationale of each value).

export type TradingMode = 'auto' | 'confirm';

export type RiskProfile = 'conservative' | 'moderate' | 'aggressive' | 'small_frequent' | 'advanced';

export type ConnectionStatus = 'active' | 'paused' | 'revoked';

export interface ExchangeConnection {
  id: string;
  user_id: string;
  exchange: string;
  key_hint: string;
  mode: TradingMode;
  profile: RiskProfile;
  position_pct: number;
  daily_loss_limit_pct: number;
  max_positions: number;
  status: ConnectionStatus;
  paused_reason: string | null;
  last_validation_error: string | null;
  legal_version: string;
  legal_accepted_at: string;
  created_at: string;
  updated_at: string;
  testnet?: boolean;
}

export interface RiskProfilePreset {
  labelKey: string;
  descriptionKey: string;
  positionPct: number;
  dailyLossLimitPct: number;
  maxPositions: number;
}

export const RISK_PROFILES: Record<Exclude<RiskProfile, 'advanced'>, RiskProfilePreset> = {
  conservative: { labelKey: 'trading.profile.conservative', descriptionKey: 'trading.profile.conservativeDesc', positionPct: 5, dailyLossLimitPct: 3, maxPositions: 3 },
  moderate: { labelKey: 'trading.profile.moderate', descriptionKey: 'trading.profile.moderateDesc', positionPct: 10, dailyLossLimitPct: 5, maxPositions: 5 },
  aggressive: { labelKey: 'trading.profile.aggressive', descriptionKey: 'trading.profile.aggressiveDesc', positionPct: 15, dailyLossLimitPct: 10, maxPositions: 8 },
  small_frequent: { labelKey: 'trading.profile.smallFrequent', descriptionKey: 'trading.profile.smallFrequentDesc', positionPct: 2, dailyLossLimitPct: 4, maxPositions: 8 },
};

// Hard system caps (validated again on the server at connect/update time).
export const HARD_CAPS = {
  maxPositionPct: 15,
  dailyLossMinPct: 1,
  dailyLossMaxPct: 15,
  maxPositions: 8,
};

export const DEFAULT_PROFILE: RiskProfile = 'moderate';
export const DEFAULT_MODE: TradingMode = 'confirm';
export const LEGAL_VERSION = 'v2';
