import { Address, Amount } from "@safeblock/blockchain-utils"
import { SdkInstance } from "~/sdk"
import { BackendResponse, ExchangeRequest, SimulatedRoute } from "~/types"
import request from "~/utils/request"

export default async function stonfiRouteFetcher(exchangeRequest: ExchangeRequest, taskId: symbol, sdkInstance: SdkInstance): Promise<SimulatedRoute | Error> {
  const path = exchangeRequest.exactInput ? "swap" : "reverse_swap"

  const simulatedRoute = await request<BackendResponse.TON.StonfiQuota>({
    base: "https://api.ston.fi/v1",
    method: "POST",
    path: `/${ path }/simulate`,
    query: {
      offer_address: exchangeRequest.tokenIn.address.toString(),
      ask_address: exchangeRequest.tokenOut.address.toString(),
      units: exchangeRequest.exactInput ? exchangeRequest.amountIn.toString() : exchangeRequest.amountOut.toString(),
      slippage_tolerance: exchangeRequest.slippageReadablePercent / 100,
      dex_v2: false
    }
  })

  if (!sdkInstance.verifyTask(taskId)) return Error("Task aborted")

  if (!simulatedRoute) return Error("No routes after simulation")

  return {
    amountIn: Amount.from(simulatedRoute.offer_units, exchangeRequest.tokenIn.decimals, false),
    amountOut: Amount.from(simulatedRoute.ask_units, exchangeRequest.tokenOut.decimals, false),
    tokenIn: exchangeRequest.tokenIn,
    tokenOut: exchangeRequest.tokenOut,
    priceImpactPercent: parseFloat(simulatedRoute.price_impact) * 100,
    isExactInput: true,
    routeReference: Math.random().toString(),
    slippageReadablePercent: 1,
    usedTokensList: [ exchangeRequest.tokenIn, exchangeRequest.tokenOut ],
    originalRoute: [
      {
        fee: 0,
        address: Address.from(Address.tonBounceableNativeAddress),
        version: "STONFI_V1",
        exchange_id: "8043155f-c176-448c-8107-06236fdf4423",
        token0: {
          ...exchangeRequest.tokenIn,
          fee: 0
        },
        token1: {
          ...exchangeRequest.tokenOut,
          fee: 0
        }
      }
    ]
  }
}