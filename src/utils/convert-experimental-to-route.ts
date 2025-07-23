import { Amount, arrayUtils } from "@safeblock/blockchain-utils"
import { MultiswapRouterFaucet__factory } from "~/abis/types"
import { PriceStorageExtension } from "~/extensions"
import { ExchangeUtils } from "~/sdk/exchange-utils"
import SdkCore from "~/sdk/sdk-core"
import { BackendResponse, ExchangeRequest, SimulatedRoute } from "~/types"

export default function convertExperimentalToRoute(sdkInstance: SdkCore, request: ExchangeRequest, experimentalRoute: BackendResponse.IExperimentalRoutingResponse): SimulatedRoute {
  const amountOut = Amount.from(experimentalRoute.amount_out, request.tokensOut[0].decimals, false)

  const multiSwapRouterIface = MultiswapRouterFaucet__factory.createInterface()

  const callData = multiSwapRouterIface.encodeFunctionData("multiswap", [
    {
      tokensOut: experimentalRoute.calldata.tokens_out,
      tokensIn: experimentalRoute.calldata.tokens_in,
      pairs: experimentalRoute.calldata.pairs,
      minAmountsOut: experimentalRoute.calldata.min_amounts_out
    }
  ])

  return {
    originalRouteSet: [],
    routeReference: "experimental" + JSON.stringify(experimentalRoute.calldata),

    tokenIn: request.tokenIn,
    tokensOut: request.tokensOut,
    amountIn: request.amountIn,
    amountsOut: [amountOut],
    amountOutReadablePercentages: [100],

    smartRoutingDetails: {
      callData,
      exchangeIds: experimentalRoute.exchanges,
      gasUsage: arrayUtils.safeReduce(experimentalRoute.calldata.pairs.flat(2).map(pair => {
        return pair.startsWith("0x8") ? 450_000 : 300_000
      })).toFixed(0)
    },

    slippageReadablePercent: request.slippageReadablePercent,

    isExactInput: true,

    destinationAddress: request.destinationAddress,
    arrivalGasAmount: request.arrivalGasAmount,

    priceImpactPercents: [ExchangeUtils.computePriceImpact(
      request,
      request.tokensOut[0],
      request.amountIn,
      amountOut,
      sdkInstance.extension(PriceStorageExtension)
    )],
    usedTokensList: [
      request.tokenIn,
      ...request.tokensOut
    ]
  }
}