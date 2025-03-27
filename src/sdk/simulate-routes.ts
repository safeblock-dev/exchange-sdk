import { Address, Amount, arrayUtils, multicall } from "@safeblock/blockchain-utils"
import { MaxUint256 } from "ethers"
import { MultiSwapRouter__factory } from "~/abis/types"
import { contractAddresses } from "~/config"
import { PriceStorageExtension } from "~/extensions"
import { ExchangeUtils } from "~/sdk/exchange-utils"
import { SdkConfig } from "~/sdk/index"
import convertPairsToHex from "~/utils/convert-pairs-to-hex"
import { ExchangeRequest, MultiCallRequest, RouteStep, SimulatedRoute } from "~/types"
import { BasicToken } from "~/types"

export default async function simulateRoutes(request: ExchangeRequest, priceStorage: PriceStorageExtension, routes: RouteStep[][], config?: SdkConfig) {
  const getRouteReference = (route: RouteStep[]) => {
    return route.map(r => r.address + r.exchange_id + r.token0.address.toString() + r.token1.address.toString()).join(":")
  }

  const calls: MultiCallRequest[] = routes.map(route => {
    const pairs = convertPairsToHex(route)

    const _calls: MultiCallRequest["calls"][0][] = []

    if (request.exactInput) {
      _calls.push({
        method: "multiswap",
        reference: getRouteReference(route),
        methodParameters: [
          {
            minAmountOut: 0,
            tokenIn: request.tokenIn.address.toString(),
            pairs,
            amountIn: request.amountIn.toBigInt()
          }
        ]
      })
    }
    else {
      _calls.push({
        method: "multiswapReverse",
        reference: getRouteReference(route),
        methodParameters: [
          {
            minAmountOut: 0,
            tokenIn: request.tokenOut.address.toString(),
            pairs,
            amountIn: request.amountOut.toBigInt()
          }
        ]
      })
    }

    return {
      contractInterface: MultiSwapRouter__factory,
      target: Address.from(contractAddresses.quoter(request.tokenIn.network, config)),
      calls: _calls
    }
  })

  const simulationResult = await arrayUtils.asyncNonNullable(
    arrayUtils.asyncMap(
      multicall<[ BigInt ]>(request.tokenIn.network, calls),
      route => ({ ref: route.reference, amount: BigInt(route.data?.[0].toString() ?? 0) })
    )
  )


  const simulatedRoutes: SimulatedRoute[] = []

  simulationResult
    .filter(route => route.amount && route.amount > BigInt(0) && route.amount < MaxUint256)
    .forEach(route => {
      if (!route.amount) return

      const relatedRoute = routes.find(r => getRouteReference(r) === route.ref)

      if (!relatedRoute) return

      let amountIn = request.amountIn
      let amountOut = request.amountOut

      if (request.exactInput) {
        amountOut = new Amount(route.amount, request.tokenOut.decimals, false)
      }
      else {
        amountIn = new Amount(route.amount, request.tokenIn.decimals, false)
      }

      const allTokens = routes.map(route => route.map(r => [r.token1, r.token1])).flat(2)
      const uniqueTokens: BasicToken[] = []

      allTokens.forEach(token => {
        if (uniqueTokens.some(t => t.network.name === token.network.name && t.address.equalTo(token.address))) return

        uniqueTokens.push(token)
      })

      simulatedRoutes.push({
        routeReference: route.ref ?? "",
        amountIn: amountIn,
        amountOut: amountOut,
        originalRoute: relatedRoute,
        tokenIn: request.tokenIn,
        tokenOut: request.tokenOut,
        isExactInput: request.exactInput,
        slippageReadablePercent: request.slippageReadablePercent,
        destinationAddress: Address.from(request.destinationAddress ?? Address.zeroAddress),
        arrivalGasAmount: request.arrivalGasAmount,
        priceImpactPercent: ExchangeUtils.computePriceImpact(request, amountIn, amountOut, priceStorage),
        usedTokensList: uniqueTokens
      })
    })


  if (request.exactInput) return simulatedRoutes.sort((a, b) => a.amountOut.gt(b.amountOut) ? -1 : 1)

  return simulatedRoutes.sort((a, b) => a.amountIn.lt(b.amountIn) ? -1 : 1)
}
