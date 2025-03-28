import { Address, Amount } from "@safeblock/blockchain-utils"
import { Network } from "ethers"

export namespace BackendResponse {
  export interface IBackendRouteStep {
    address: Address
    exchange_id: string
    fee: number

    token0_fee: number
    token1_fee: number

    token0_id: string
    token1_id: string

    version: string
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
}

export interface BasicToken {
  address: Address
  decimals: number
  network: Network
}

export interface RouteStep extends Omit<BackendResponse.IBackendRouteStep, "token0_id" | "token1_id" | "token0_fee" | "token1_fee"> {
  token0: BasicToken & { fee: number }
  token1: BasicToken & { fee: number }
}

export interface SimulatedRoute {
  originalRoute: RouteStep[]
  routeReference: string

  tokenIn: BasicToken
  tokenOut: BasicToken
  amountIn: Amount
  amountOut: Amount

  slippageReadablePercent: number

  isExactInput: boolean

  destinationAddress?: Address
  arrivalGasAmount?: Amount

  priceImpactPercent: number
  usedTokensList: BasicToken[]
}

export interface ExchangeRequest {
  tokenIn: BasicToken
  tokenOut: BasicToken
  amountIn: Amount
  amountOut: Amount
  exactInput: boolean
  slippageReadablePercent: number
  destinationAddress?: Address
  arrivalGasAmount?: Amount
}

export type ExecutorCallData = {
  callData: any,
  network: Network,
  value?: Amount,
  gasLimitMultiplier?: number,
  to: Address
}

export interface ExchangeQuota {
  executorCallData: ExecutorCallData[]
  exchangeRoute: RouteStep[][],
  estimatedGasUsage: Record<string, Amount>
  amountIn: Amount
  amountOut: Amount
  tokenIn: BasicToken
  tokenOut: BasicToken
  slippageReadable: number
  priceImpact: number
}