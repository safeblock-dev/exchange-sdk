import { Address, Amount } from "@safeblock/blockchain-utils"
import { Network } from "ethers"

export namespace BackendResponse {
  export type UnitsAPIResponse = {
    args: [
      string[],
      string[],
      {
        executionPrice: string
        deadline: string
        v: number
        r: string
        s: string
      }
    ]
  }

  export interface IBackendRouteStep {
    address: Address
    exchange_id: string
    fee: number

    token0_id: string
    token1_id: string

    fee_type: "algorithm" | "constant" | "none"
    fee_algorithm?: string

    version: string
  }

  export interface IExperimentalRoutingResponse {
    amount_in: string
    amount_out: string
    calldata: {
      tokens_in: string[],
      tokens_out: string[],
      min_amounts_out: string[],
      pairs: string[][]
    }
    exchanges: string[]
  }

  interface IBackendToken {
    id: string
    address: string
    decimals: number
  }

  export interface IRoutesResponse {
    items: {
      swap: IBackendRouteStep[]
      multiswap: IBackendRouteStep[][]
    }
    tokens: Record<string, IBackendToken>
  }

  export interface IRoutesResponseNext {
    percents: string[]
    route: IBackendRouteStep[][]
    tokens: Record<string, IBackendToken>
  }
}

/**
 * Basic information about a particular token
 */
export interface BasicToken {
  /** Token address */
  address: Address
  /** Number of decimal places the token uses */
  decimals: number
  /** Network the token belongs to */
  network: Network
}

export interface RouteStep extends Omit<BackendResponse.IBackendRouteStep, "token0_id" | "token1_id"> {
  token0: BasicToken
  token1: BasicToken
}

export interface SingleOutputSimulatedRoute {
  originalRoute: RouteStep[]
  routeReference: string

  tokenIn: BasicToken
  tokenOut: BasicToken
  amountIn: Amount
  amountOut: Amount

  isExactInput: boolean
}

/**
 * Swap route that has successfully passed simulation
 */
export interface SimulatedRoute {
  originalRouteSet: RouteStep[][]
  routeReference: string

  estimatedPartialPercents?: string[]

  tokenIn: BasicToken
  tokensOut: BasicToken[]
  amountIn: Amount
  amountsOut: Amount[]
  amountOutReadablePercentages: number[]

  smartRoutingDetails?: {
    callData: string
    exchangeIds: string[]
  }

  slippageReadablePercent: number

  isExactInput: boolean

  destinationAddress?: Address
  arrivalGasAmount?: Amount

  priceImpactPercents: number[]
  usedTokensList: BasicToken[]
}

/**
 * Exchange request
 */
export interface ExchangeRequest {
  /** Input token */
  tokenIn: BasicToken
  /** Output tokens */
  tokensOut: BasicToken[]
  /** Input token amount */
  amountIn: Amount
  /** Output token amounts */
  amountsOut: Amount[]
  /** Distribution percentages for output tokens */
  amountOutReadablePercentages: number[]
  /** Swap direction */
  exactInput: boolean
  /** Slippage in percent */
  slippageReadablePercent: number
  /** Target address for the swap */
  destinationAddress?: Address
  /** Native currency amount for the arrival‑gas function */
  arrivalGasAmount?: Amount
  /** Smart routing switch */
  smartRouting?: boolean
  /** Precision of the smart routing. 1-100 */
  smartRoutingPrecision?: number
}

/**
 * Executable transaction data.
 *
 * Can be processed manually or passed to `prepareEthersTransaction`
 * to obtain an ethers‑compatible transaction object.
 */
export type ExecutorCallData = {
  /** Transaction calldata */
  callData: any,
  /** Network on which the transaction should be executed */
  network: Network,
  /** Native currency value sent with the transaction */
  value?: Amount,
  /** Gas‑limit multiplier relative to the estimated value */
  gasLimitMultiplier?: number,
  /** Destination address of the transaction */
  to: Address
}

/**
 * Exchange quota
 */
export interface ExchangeQuota {
  /** Data for the transactions executed during the swap */
  executorCallData: ExecutorCallData[]
  /** Swap route */
  exchangeRoute: RouteStep[][][],
  /** Estimated gas usage for the swap */
  estimatedGasUsage: Record<string, Amount>
  /** Input token amount */
  amountIn: Amount
  /** Output token amounts */
  amountsOut: Amount[]
  /** Input token */
  tokenIn: BasicToken
  /** Output tokens */
  tokensOut: BasicToken[]
  /** Distribution percentages for output tokens */
  amountOutReadablePercentages: number[]
  /** Slippage in percent */
  slippageReadable: number
  /** Price impact for each output token */
  priceImpact: number[]
}