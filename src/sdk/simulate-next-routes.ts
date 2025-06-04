import { Amount, arrayUtils, ethersProvider } from "@safeblock/blockchain-utils"
import BigNumber from "bignumber.js"
import { Quoter__factory } from "~/abis/types"
import { contractAddresses } from "~/config"
import { PriceStorageExtension } from "~/extensions"
import { ExchangeUtils } from "~/sdk/exchange-utils"
import SdkCore, { SdkConfig } from "~/sdk/sdk-core"
import SdkException, { SdkExceptionCode } from "~/sdk/sdk-exception"
import { ExchangeRequest, RouteStep, SimulatedRoute } from "~/types"
import convertPairsToHex from "~/utils/convert-pairs-to-hex"

interface Options {
  request: ExchangeRequest
  route: RouteStep[][]
  percents: string[]
  config: SdkConfig
  sdkInstance: SdkCore
}

export default async function simulateNextRoutes(options: Options): Promise<SimulatedRoute | SdkException> {
  if (options.percents.length !== options.route.length)
    return new SdkException("Percents array length mismatch", SdkExceptionCode.SimulationFailed)

  const { request, route, config, percents } = options

  const quoter = Quoter__factory.connect(
    contractAddresses.quoter(request.tokenIn.network, config),
    ethersProvider(request.tokenIn.network)
  )

  const mismatchAmount = new BigNumber(1e18).minus(arrayUtils.safeReduce(percents.map(p => new BigNumber(p))))

  const result = await quoter.multiswap2({
    fullAmount: request.amountIn.toString(),
    tokenIn: request.tokenIn.address.toString(),
    tokensOut: [request.tokensOut[0].address.toString()],
    minAmountsOut: [],
    amountInPercentages: [...percents.slice(0, -1), mismatchAmount.plus((percents.at(-1) || "")).toFixed()],
    pairs: route.map(part => convertPairsToHex(part))
  })

  const getRouteReference = (route: RouteStep[]) => {
    return route.map(r => r.address + r.exchange_id + r.token0.address.toString() + r.token1.address.toString()).join(":")
  }

  const amountOut = Amount.from(result[0].toString(), request.tokensOut[0].decimals, false)

  return {
    tokensOut: [request.tokensOut[0]],
    tokenIn: request.tokenIn,
    amountIn: request.amountIn,
    amountsOut: [amountOut],
    isExactInput: request.exactInput,
    routeReference: route.map(getRouteReference).join("+") + "+part_swap",
    amountOutReadablePercentages: request.amountOutReadablePercentages,
    arrivalGasAmount: request.arrivalGasAmount,
    destinationAddress: request.destinationAddress,
    originalRouteSet: route,
    slippageReadablePercent: request.slippageReadablePercent,
    priceImpactPercents: [ExchangeUtils.computePriceImpact(
      request,
      request.tokensOut[0],
      request.amountIn,
      amountOut,
      options.sdkInstance.extension(PriceStorageExtension)
    )],
    usedTokensList: route.map(i => i.map(o => [o.token0, o.token1])).flat(2)
  }
}