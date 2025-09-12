import { Address, Amount } from "@safeblock/blockchain-utils"
import { contractAddresses } from "~/config"
import { SdkConfig } from "~/sdk"
import acrossAggregationModule from "~/sdk/bridge-aggregation/modules/across"
import celerAggregationModule from "~/sdk/bridge-aggregation/modules/celer"
import stargateAggregationModule from "~/sdk/bridge-aggregation/modules/stargate"
import SdkCore from "~/sdk/sdk-core"
import SdkException, { SdkExceptionCode } from "~/sdk/sdk-exception"
import { AggregationModuleRequestParams, AggregationModuleResponse, AggregationResponse, ExchangeRequest, SimulatedRoute } from "~/types"

interface BridgingDetails {
  senderAddress: Address
  sourceChainRoute?: SimulatedRoute | null
  sourceNetworkSendAmount: Amount
  request: ExchangeRequest
  destinationChainRoute?: SimulatedRoute | null
  destinationNetworkCallData: string | null
  sdkConfig: SdkConfig
}

export default async function aggregateBridges(sdk: SdkCore, sdkConfig: SdkConfig, options: BridgingDetails): Promise<AggregationResponse | SdkException> {
  const fromNetworkUSDC = contractAddresses.usdcParams(options.request.tokenIn.network)

  const amountLD = !Address.equal(options.request.tokenIn.address, fromNetworkUSDC.address) ? "0" : Amount
    .select(options.sourceChainRoute?.amountIn!, options.sourceNetworkSendAmount)!.toString()

  const receiverAddress = options.destinationNetworkCallData
    ? contractAddresses.entryPoint(options.request.tokensOut[0].network, options.sdkConfig)
    : (options.request.destinationAddress || options.senderAddress || Address.zeroAddress).toString()

  //const gasLimit = (options.destinationNetworkCallData
  //  ? (450_000 + (150_000 * (options.destinationChainRoute?.originalRouteSet.flat(1).length ?? 0))) : 0).toFixed(0)

  options.sdkConfig.debugLogListener?.("BridgeAggregation: Sending request to bridge aggregator...")

  const aggregationResult = await aggregate(sdk, sdkConfig, {
    destinationAddress: (options.request.destinationAddress ?? options.senderAddress),
    userAddress: options.senderAddress,
    inputAmountRaw: Amount.select(options.sourceChainRoute?.amountsOut?.[0], options.sourceNetworkSendAmount)!.toString(),
    amountLD,
    sourceChainId: parseInt(options.request.tokenIn.network.chainId.toString()),
    destinationChainId: parseInt(options.request.tokensOut[0].network.chainId.toString()),
    outputTokens: options.request.tokensOut,
    inputToken: {
      address: Address.from(fromNetworkUSDC.address),
      decimals: fromNetworkUSDC.decimals,
      network: options.request.tokenIn.network
    },
    //message: options.destinationNetworkCallData || "0x",
    receiverAddress
  })

  //if (aggregationResult instanceof SdkException) {
  //  options.sdkConfig.debugLogListener?.(`BridgeAggregation: Aggregator responded with error: ${ aggregationResult.message }`)
  //  options.sdkConfig.debugLogListener?.("BridgeAggregation: Aggregator not configured or not responded")
  //  options.sdkConfig.debugLogListener?.("BridgeAggregation: Using fallback internal computation logic")
  //
  //  const bridgeIface = BridgeFaucet__factory.createInterface()
  //
  //  const fallbackCalldata = bridgeIface.encodeFunctionData("sendStargateV2", [
  //    contractAddresses.stargateUSDCPool(options.request.tokenIn.network),
  //    stargateNetworksMapping(options.request.tokensOut[0].network),
  //    receiverAddress,
  //    gasLimit,
  //    options.destinationNetworkCallData || toUtf8Bytes("")
  //  ])
  //
  //  options.sdkConfig.debugLogListener?.("BridgeAggregation: Stargate calldata computed")
  //
  //  const bridgeQuota = await ExchangeUtils.computeBridgeQuota(
  //    options.request,
  //    options.senderAddress,
  //    options.sourceNetworkSendAmount.toBigNumber().toFixed(0),
  //    options.destinationChainRoute?.originalRouteSet.flat(1).length ?? 0,
  //    options.destinationNetworkCallData,
  //    options.sdkConfig
  //  )
  //
  //  if (bridgeQuota instanceof SdkException) return bridgeQuota
  //
  //  options.sdkConfig.debugLogListener?.("BridgeAggregation: Stargate bridge quota computed")
  //
  //  return {
  //    valueToSend: Amount.from(bridgeQuota.valueToSend, 18, false),
  //    bridgeCallData: fallbackCalldata,
  //    bridgeName: "stargate"
  //  }
  //}

  if (aggregationResult instanceof SdkException) return aggregationResult

  options.sdkConfig.debugLogListener?.("BridgeAggregation: Aggregator responded with third party bridge "
    + aggregationResult.label)

  options.sdkConfig.debugLogListener?.("BridgeAggregation: Bridge transaction price impact "
    + `is ${ aggregationResult.prices.impact }%`)

  return {
    valueToSend: Amount.from(aggregationResult.valueToSend, 18, false),
    bridgeCallData: aggregationResult.callData,
    bridgeName: aggregationResult.label
  }
}

async function aggregate(sdk: SdkCore, sdkConfig: SdkConfig, options: AggregationModuleRequestParams) {
  const bridgeResponses = await Promise.all([
    acrossAggregationModule(sdk, sdkConfig, options).catch((e: any) => {
      return new SdkException(e?.message || "Failed to process across bridge", SdkExceptionCode.InternalError)
    }),
    stargateAggregationModule(sdk, sdkConfig, options).catch((e: any) => {
      return new SdkException(e?.message || "Failed to process stargate bridge", SdkExceptionCode.InternalError)
    }),
    celerAggregationModule(sdk, sdkConfig, options).catch((e: any) => {
      return new SdkException(e?.message || "Failed to process celer bridge", SdkExceptionCode.InternalError)
    })
  ])

  if (bridgeResponses.every(r => r instanceof SdkException)) {
    return new SdkException(`Failed to process all bridges: [${ bridgeResponses.map(b => (b as SdkException).message).join(", ") }]`,
      SdkExceptionCode.InternalError)
  }

  const successBridges = bridgeResponses
    .filter(b => !(b instanceof SdkException)) as AggregationModuleResponse[]
  
  if (successBridges.length === 0) {
    return new SdkException("Failed to process any bridges: without error messages", SdkExceptionCode.InternalError)
  }

  const sortedOutput = successBridges
    .sort((a, b) => a.prices.impact - b.prices.impact)
    .at(0)

  if (!sortedOutput) return new SdkException("Failed to process any bridges: without error messages", SdkExceptionCode.InternalError)

  return sortedOutput
}