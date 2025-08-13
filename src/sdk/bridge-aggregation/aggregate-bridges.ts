import { Address, Amount } from "@safeblock/blockchain-utils"
import { toUtf8Bytes } from "ethers"
import { BridgeFaucet__factory } from "~/abis/types"
import { contractAddresses, stargateNetworksMapping } from "~/config"
import { SdkConfig } from "~/sdk"
import acrossAggregationModule from "~/sdk/bridge-aggregation/modules/across"
import stargateAggregationModule from "~/sdk/bridge-aggregation/modules/stargate"
import { ExchangeUtils } from "~/sdk/exchange-utils"
import SdkCore from "~/sdk/sdk-core"
import SdkException, { SdkExceptionCode } from "~/sdk/sdk-exception"
import { AggregationModuleRequestParams, AggregationResponse, ExchangeRequest, SimulatedRoute } from "~/types"

interface BridgingDetails {
  senderAddress: Address
  sourceChainRoute?: SimulatedRoute | null
  sourceNetworkSendAmount: Amount
  request: ExchangeRequest
  destinationChainRoute?: SimulatedRoute | null
  destinationNetworkCallData: string | null
  sdkConfig: SdkConfig
}

export default async function aggregateBridges(sdk: SdkCore, options: BridgingDetails): Promise<AggregationResponse | SdkException> {
  const fromNetworkUSDC = contractAddresses.usdcParams(options.request.tokenIn.network)

  const amountLD = !Address.equal(options.request.tokenIn.address, fromNetworkUSDC.address) ? "0" : Amount
    .select(options.sourceChainRoute?.amountIn!, options.sourceNetworkSendAmount)!.toString()

  const receiverAddress = options.destinationNetworkCallData
    ? contractAddresses.entryPoint(options.request.tokensOut[0].network, options.sdkConfig)
    : (options.request.destinationAddress || options.senderAddress || Address.zeroAddress).toString()

  const gasLimit = (options.destinationNetworkCallData
    ? (450_000 + (150_000 * (options.destinationChainRoute?.originalRouteSet.flat(1).length ?? 0))) : 0).toFixed(0)

  options.sdkConfig.debugLogListener?.("BridgeAggregation: Sending request to bridge aggregator...")

  const aggregationResult = await aggregate(sdk, {
    destinationAddress: (options.request.destinationAddress ?? options.senderAddress),
    userAddress: options.senderAddress,
    inputAmountRaw: Amount.select(options.sourceChainRoute?.amountsOut?.[0], options.sourceNetworkSendAmount)!.toString(),
    amountLD,
    sourceChainId: parseInt(options.request.tokenIn.network.chainId.toString()),
    destinationChainId: parseInt(options.request.tokensOut[0].network.chainId.toString()),
    inputToken: {
      address: Address.from(fromNetworkUSDC.address),
      decimals: fromNetworkUSDC.decimals,
      network: options.request.tokenIn.network
    },
    message: options.destinationNetworkCallData || "0x",
    receiverAddress,
    gasLimit
  })

  if (aggregationResult instanceof SdkException) {
    options.sdkConfig.debugLogListener?.(`BridgeAggregation: Aggregator responded with error: ${ aggregationResult.message }`)
    options.sdkConfig.debugLogListener?.("BridgeAggregation: Aggregator not configured or not responded")
    options.sdkConfig.debugLogListener?.("BridgeAggregation: Using fallback internal computation logic")

    const bridgeIface = BridgeFaucet__factory.createInterface()

    const fallbackCalldata = bridgeIface.encodeFunctionData("sendStargateV2", [
      contractAddresses.stargateUSDCPool(options.request.tokenIn.network),
      stargateNetworksMapping(options.request.tokensOut[0].network),
      receiverAddress,
      gasLimit,
      options.destinationNetworkCallData || toUtf8Bytes("")
    ])

    options.sdkConfig.debugLogListener?.("BridgeAggregation: Stargate calldata computed")

    const bridgeQuota = await ExchangeUtils.computeBridgeQuota(
      options.request,
      options.senderAddress,
      options.sourceNetworkSendAmount.toBigNumber().toFixed(0),
      options.destinationChainRoute?.originalRouteSet.flat(1).length ?? 0,
      options.destinationNetworkCallData,
      options.sdkConfig
    )

    if (bridgeQuota instanceof SdkException) return bridgeQuota

    options.sdkConfig.debugLogListener?.("BridgeAggregation: Stargate bridge quota computed")

    return {
      valueToSend: Amount.from(bridgeQuota.valueToSend, 18, false),
      bridgeCallData: fallbackCalldata,
      bridgeName: "stargate"
    }
  }

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

async function aggregate(sdk: SdkCore, options: AggregationModuleRequestParams) {
  const [across, stargate] = await Promise.all([
    acrossAggregationModule(sdk, options).catch((e: any) => {
      return new SdkException(e?.message || "Failed to process across bridge", SdkExceptionCode.InternalError)
    }),
    stargateAggregationModule(sdk, options).catch((e: any) => {
      return new SdkException(e?.message || "Failed to process stargate bridge", SdkExceptionCode.InternalError)
    })
  ])

  if (across instanceof SdkException && stargate instanceof SdkException) {
    return new SdkException(`Failed to process both bridges: [${ [across.message, stargate.message].join(", ") }]`,
      SdkExceptionCode.InternalError)
  }

  if (across instanceof SdkException) return stargate
  if (stargate instanceof SdkException) return across

  if (across.prices.impact > stargate.prices.impact) return stargate
  return across
}