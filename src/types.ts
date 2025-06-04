import { Address, Amount } from "@safeblock/blockchain-utils"
import { Network } from "ethers"

export namespace BackendResponse {
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

/*



{
  "percents": [333333333, 3000000000000, 600000000000]
  "route": [ 100 USDC
      70 USDC [
        {
          "address": "0x4f31Fa980a675570939B737Ebdde0471a4Be40Eb",
          "exchange_id": "018fdd20-5791-718a-8ae9-8025e09fcb73",
          "fee": 500,
          "fee_type": "none",
          "fee_algorithm": null,
          "network": "binance",
          "token0_id": "0196489a-ad57-754c-8cff-d941797fc9d8",
          "token1_id": "0196489a-ad8f-7e74-85f4-c297d327db3a",
          "version": "uniswap_v3"
        },
        {
          "address": "0x4f31Fa980a675570939B737Ebdde0471a4Be40Eb",
          "exchange_id": "018fdd20-5791-718a-8ae9-8025e09fcb73",
          "fee": 500,
          "fee_type": "none",
          "fee_algorithm": null,
          "network": "binance",
          "token0_id": "0196489a-ad57-754c-8cff-d941797fc9d8",
          "token1_id": "0196489a-ad8f-7e74-85f4-c297d327db3a",
          "version": "uniswap_v3"
        }
      ],
      10 USDC [
        {
          "address": "0x92b7807bF19b7DDdf89b706143896d05228f3121",
          "exchange_id": "018fdd20-5791-718a-8ae9-8025e09fcb73",
          "fee": 100,
          "fee_type": "none",
          "fee_algorithm": null,
          "network": "binance",
          "token0_id": "0196489a-ad57-754c-8cff-d941797fc9d8",
          "token1_id": "0196489a-ad8f-7e74-85f4-c297d327db3a",
          "version": "uniswap_v3"
        },
      ],
      20 USDC [
        {
          "address": "0x2C3c320D49019D4f9A92352e947c7e5AcFE47D68",
          "exchange_id": "018fdd20-5791-719e-9336-d84deea78559",
          "fee": 100,
          "fee_type": "none",
          "fee_algorithm": null,
          "network": "binance",
          "token0_id": "0196489a-ad57-754c-8cff-d941797fc9d8",
          "token1_id": "0196489a-ad8f-7e74-85f4-c297d327db3a",
          "version": "uniswap_v3"
        }
      ]
  ],
  "tokens": {
    "0196489a-ad57-754c-8cff-d941797fc9d8": {
      "address": "0x55d398326f99059fF775485246999027B3197955",
      "decimals": 18,
      "id": "0196489a-ad57-754c-8cff-d941797fc9d8",
      "name": "Tether USD",
      "network": "binance",
      "symbol": "USDT"
    },
    "0196489a-ad8f-7e74-85f4-c297d327db3a": {
      "address": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      "decimals": 18,
      "id": "0196489a-ad8f-7e74-85f4-c297d327db3a",
      "name": "USD Coin",
      "network": "binance",
      "symbol": "USDC"
    }
  },
  "total_size": 1
}

 */

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