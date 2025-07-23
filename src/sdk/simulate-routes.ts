import { Address, Amount, arrayUtils, multicall, MultiCallRequest } from "@safeblock/blockchain-utils"
import { MaxUint256 } from "ethers"
import { Quoter__factory } from "~/abis/types"
import { contractAddresses } from "~/config"
import { PriceStorageExtension } from "~/extensions"
import { ExchangeUtils } from "~/sdk/exchange-utils"
import { SdkConfig } from "~/sdk/index"
import SdkCore from "~/sdk/sdk-core"
import SdkException, { SdkExceptionCode } from "~/sdk/sdk-exception"
import { BasicToken, ExchangeRequest, RouteStep, SimulatedRoute, SingleOutputSimulatedRoute } from "~/types"
import convertPairsToHex from "~/utils/convert-pairs-to-hex"

interface Options {
  tokenIn: BasicToken
  tokenOut: BasicToken
  amountIn: Amount
  amountOut: Amount
  routes: RouteStep[][]
  exactInput: boolean
  config: SdkConfig

  sdkInstance: SdkCore
}

async function simulateSingeOutputRoutes(options: Options): Promise<SingleOutputSimulatedRoute[]> {
  if (ExchangeUtils.isWrapUnwrap({ tokenIn: options.tokenIn, tokensOut: [options.tokenOut] })) {
    return [{
      tokenIn: options.tokenIn,
      tokenOut: options.tokenOut,
      originalRoute: [],
      routeReference: "wrap-unwrap",
      amountIn: options.exactInput ? options.amountIn : options.amountOut,
      amountOut: options.exactInput ? options.amountIn : options.amountOut,
      isExactInput: options.exactInput
    }]
  }

  if (options.tokenIn.address.equalTo(options.tokenOut.address) && options.tokenIn.network.name === options.tokenOut.network.name) {
    return [{
      tokenIn: options.tokenIn,
      tokenOut: options.tokenOut,
      originalRoute: [],
      routeReference: "transfer",
      amountIn: options.exactInput ? options.amountIn : options.amountOut,
      amountOut: options.exactInput ? options.amountIn : options.amountOut,
      isExactInput: options.exactInput
    }]
  }

  const getRouteReference = (route: RouteStep[]) => {
    return route.map(r => r.address + r.exchange_id + r.token0.address.toString() + r.token1.address.toString()).join(":")
  }

  const tokenInAddress = Address.requireWrapped(options.tokenIn.address, options.tokenIn.network)

  const tokenOutAddress = Address.requireWrapped(options.tokenOut.address, options.tokenOut.network)

  const calls: MultiCallRequest[] = options.routes.map(route => {
    const pairs = convertPairsToHex(route)

    const _calls: MultiCallRequest["calls"][0][] = []

    if (options.exactInput) {
      _calls.push({
        method: "multiswap",
        reference: getRouteReference(route),
        methodParameters: [
          {
            minAmountOut: 0,
            tokenIn: tokenInAddress.toString(),
            pairs: pairs,
            tokenOut: tokenOutAddress.toString(),
            amountIn: options.amountIn.toBigInt()
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
            tokenIn: tokenOutAddress.toString(),
            pairs,
            amountIn: options.amountOut.toBigInt()
          }
        ]
      })
    }

    return {
      contractInterface: Quoter__factory,
      target: Address.from(contractAddresses.quoter(options.tokenIn.network, options.config)),
      calls: _calls
    }
  })

  const simulationResult = await arrayUtils.asyncNonNullable(
    arrayUtils.asyncMap(
      multicall<[BigInt]>(options.tokenIn.network, calls),
      route => ({ ref: route.reference, amount: BigInt(route.data?.[0].toString() ?? 0) })
    )
  )

  const simulatedRoutes: SingleOutputSimulatedRoute[] = []

  simulationResult
    .filter(route => route.amount && route.amount > BigInt(0) && route.amount < MaxUint256)
    .forEach(route => {
      if (!route.amount) return

      const relatedRoute = options.routes.find(r => getRouteReference(r) === route.ref)

      if (!relatedRoute) return

      let amountIn = options.amountIn
      let amountOut = options.amountOut

      if (options.exactInput) {
        amountOut = new Amount(route.amount, options.tokenOut.decimals, false)
      }
      else {
        amountIn = new Amount(route.amount, options.tokenIn.decimals, false)
      }

      const allTokens = options.routes.map(route => route.map(r => [r.token1, r.token1])).flat(2)
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
        tokenIn: options.tokenIn,
        tokenOut: options.tokenOut,
        isExactInput: options.exactInput
      })
    })

  const sortRoutes = () => {
    if (options.exactInput) return [...simulatedRoutes].sort((a, b) => a.amountOut.gt(b.amountOut) ? -1 : 1)

    return [...simulatedRoutes].sort((a, b) => a.amountIn.lt(b.amountIn) ? -1 : 1)
  }

  return sortRoutes().filter(route => ExchangeUtils
    .filterRoutesByExpectedOutput(route, options.sdkInstance
      .extension(PriceStorageExtension), options.config.routePriceDifferenceLimit, options.config))
}

export default async function simulateRoutes(
  request: ExchangeRequest,
  routes: RouteStep[][][],
  config: SdkConfig,
  sdkInstance: SdkCore
): Promise<SimulatedRoute | SdkException> {
  config.debugLogListener?.(`Simulate: Starting parallel simulation of ${ routes.flat(3).length } routes for ${ request.tokensOut.length } tokens...`)
  const at = Date.now()

  const eachTokenRawOutputs = (await Promise.all(
    request.tokensOut.map((tokenOut, index) => (
      simulateSingeOutputRoutes({
        config,
        sdkInstance,
        routes: routes[index],
        amountIn: request.amountIn.mul(request.amountOutReadablePercentages[index] / 100),
        amountOut: request.amountsOut[index],
        exactInput: request.exactInput,
        tokenIn: request.tokenIn,
        tokenOut: tokenOut
      })
    ))
  ))

  eachTokenRawOutputs.forEach((tokenOutput, index) => {
    const addr = request.tokensOut[index].address.toString().slice(0, 10)
    config.debugLogListener?.(`Simulate for ${ addr }: sorted route outputs: [${ tokenOutput.map(t => t.amountOut.toReadable()).join(",") }]`)
  })

  config.debugLogListener?.(`Simulate: raw route outputs received in ${ Date.now() - at }ms`)

  const eachTokenOutput = eachTokenRawOutputs.map(rawOutputs => rawOutputs[0])
    .filter(Boolean)

  const amountIn = request.exactInput ? request.amountIn : eachTokenOutput[0]?.amountIn
  if (!amountIn) return new SdkException("Invalid routes returned after simulation: no input amount", SdkExceptionCode.RoutesNotFound)

  return {
    tokensOut: request.tokensOut,
    tokenIn: request.tokenIn,
    amountIn: amountIn,
    amountsOut: eachTokenOutput.map(output => output.amountOut),
    isExactInput: request.exactInput,
    routeReference: eachTokenOutput.map(o => o.routeReference).join("+"),
    amountOutReadablePercentages: request.amountOutReadablePercentages,
    arrivalGasAmount: request.arrivalGasAmount,
    destinationAddress: request.destinationAddress,
    originalRouteSet: eachTokenOutput.map(o => o.originalRoute),
    slippageReadablePercent: request.slippageReadablePercent,
    priceImpactPercents: eachTokenOutput.map(o => ExchangeUtils.computePriceImpact(
      request,
      o.tokenOut,
      o.amountIn,
      o.amountOut,
      sdkInstance.extension(PriceStorageExtension)
    )),
    usedTokensList: eachTokenOutput.map(o => [o.tokenIn, o.tokenOut]).flat()
  }
}
