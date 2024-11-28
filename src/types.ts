import { Address, Amount } from "@safeblock/blockchain-utils"
import { ethers, Network } from "ethers"
import { BasicToken } from "~/utils/tokens-list"

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

  export namespace Symbiosis {
    export interface DirectRoute {
      originChainId: number
      originToken: string
      destinationChainId: number
      destinationToken: string
    }

    export namespace API {
      interface Token {
        address: string
        chainId: number
        decimals: number
        symbol: string
        icon: string
        amount: string
      }

      interface FeeValue extends Token {
        amount: string
      }

      interface Fee {
        address: string
        chainId: number
        decimals: number
        symbol: string
        icon: string
        amount: string
      }

      interface ProviderFee {
        provider: string
        value: FeeValue
        save: FeeValue
        description: string
      }

      interface RouteToken extends Token {}

      interface RouteProvider {
        provider: string
        tokens: RouteToken[]
      }

      export interface SwapApiResponse {
        tx: {
          messages: [
            {
              address: string
              amount: string
              payload: string
            }
          ]
        }
        fee: Fee
        fees: ProviderFee[]
        route: RouteToken[]
        routes: RouteProvider[]
        priceImpact: string
        tokenAmountOut: Token
        tokenAmountOutMin: Token
        amountInUsd: Token
        rewards: Token[]
        approveTo: string
        inTradeType: string
        outTradeType: string
        type: string
        kind: string
        estimatedTime: number
      }
    }
  }

  export namespace TON {
    export interface StonfiQuota {
      offer_address: string
      ask_address: string
      offer_jetton_wallet: string
      ask_jetton_wallet: string
      router_address: string
      pool_address: string
      offer_units: string
      ask_units: string
      slippage_tolerance: string
      min_ask_units: string
      swap_rate: string
      price_impact: string
      fee_address: string
      fee_units: string
      fee_percent: string
    }

    export interface TokenRates {
      rates: Record<string, {
        prices: {
          USD: number
        }
      }>
    }
  }
}

export interface TonAccount {
  address: string
  chain: any
  walletStateInit: string
  publicKey?: string
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

export interface MultiCallRequest {
  target: Address
  contractInterface: { createInterface: () => ethers.Interface }
  calls: Array<{
    reference?: string
    method: string
    methodParameters: unknown[]
    allowFailure?: boolean
  }>
}

export interface Call3_MultiCallStruct {
  target: string
  allowFailure: boolean
  callData: string
  method: string
  reference?: string
}

export interface MultiCallResponse<T> {
  success: boolean
  data: T | null
  reference?: string
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
  to: Address }

export interface ExchangeQuota {
  executorCallData: ExecutorCallData[]
  amountIn: Amount
  amountOut: Amount
  tokenIn: BasicToken
  tokenOut: BasicToken
  slippageReadable: number
  priceImpact: number
}