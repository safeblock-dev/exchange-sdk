export interface Token {
  address: string
  symbol: string
  decimals: number
  chainId: number
}

export interface FeeDetail {
  pct: string
  total: string
}

export interface AcrossTokenDetails {
  originChainId: number
  destinationChainId: number
  originToken: string
  destinationToken: string
}

export interface Limits {
  minDeposit: string
  maxDeposit: string
  maxDepositInstant: string
  maxDepositShortDelay: string
  recommendedDepositInstant: string
}

export interface SuggestedFeeApiResponse {
  estimatedFillTimeSec: number
  capitalFeePct: string
  capitalFeeTotal: string
  relayGasFeePct: string
  relayGasFeeTotal: string
  relayFeePct: string
  relayFeeTotal: string
  lpFeePct: string
  timestamp: string
  isAmountTooLow: boolean
  quoteBlock: string
  exclusiveRelayer: string
  exclusivityDeadline: number
  spokePoolAddress: string
  destinationSpokePoolAddress: string
  totalRelayFee: FeeDetail
  relayerCapitalFee: FeeDetail
  relayerGasFee: FeeDetail
  lpFee: FeeDetail
  limits: Limits
  fillDeadline: string
  outputAmount: string
  inputToken: Token
  outputToken: Token
}