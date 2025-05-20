import { Address, Amount } from "@safeblock/blockchain-utils"
import { toUtf8Bytes } from "ethers"
import { BridgeFaucet__factory } from "~/abis/types"
import { contractAddresses, stargateNetworksMapping } from "~/config"
import { SdkException } from "~/index"
import { SdkConfig } from "~/sdk"
import { ExchangeUtils } from "~/sdk/exchange-utils"
import { ExchangeRequest, SimulatedRoute } from "~/types"
import request from "~/utils/request"

interface BridgeAggregatorResponse {
  error: null
  content: {
    source: string
    callData: string
    valueToSend: string
    prices: {
      impact: number
    }
  }
}

interface FetchingResult {
  bridgeName: string
  bridgeCallData: string
  valueToSend: Amount
}

interface BridgingDetails {
  senderAddress: Address
  sourceChainRoute?: SimulatedRoute | null
  sourceNetworkSendAmount: Amount
  request: ExchangeRequest
  destinationChainRoute?: SimulatedRoute | null
  destinationNetworkCallData: string | null
  sdkConfig: SdkConfig
}

export default async function fetchBridgingCalldata(options: BridgingDetails): Promise<FetchingResult | SdkException> {
  const fromNetworkUSDC = contractAddresses.usdcParams(options.request.tokenIn.network)

  const amountLD = !Address.equal(options.request.tokenIn.address, fromNetworkUSDC.address) ? "0" : Amount
    .select(options.sourceChainRoute?.amountIn!, options.sourceNetworkSendAmount)!.toString()

  const receiverAddress = options.destinationNetworkCallData
    ? contractAddresses.entryPoint(options.request.tokensOut[0].network, options.sdkConfig)
    : (options.request.destinationAddress || options.senderAddress || Address.zeroAddress).toString()

  const gasLimit = (options.destinationNetworkCallData
    ? (450_000 + (150_000 * (options.destinationChainRoute?.originalRouteSet.flat(1).length ?? 0))) : 0).toFixed(0)

  options.sdkConfig.debugLogListener?.("BridgeAggregation: Sending request to bridge aggregator...")

  const bridgeAggregatorResponse = options.sdkConfig.bridgeAggregationBackend?.url
    ? await request<BridgeAggregatorResponse>({
      base: options.sdkConfig.bridgeAggregationBackend.url,
      path: "/quota",
      method: "POST",
      headers: { ...options.sdkConfig.bridgeAggregationBackend.headers, "Content-Type": "application/json" },
      body: {
        destinationAddress: (options.request.destinationAddress ?? options.senderAddress).toString(),
        userAddress: options.senderAddress.toString(),
        inputAmountRaw: Amount.select(options.sourceChainRoute?.amountsOut?.[0], options.sourceNetworkSendAmount)!.toString(),
        amountLD,
        sourceChainId: parseInt(options.request.tokenIn.network.chainId.toString()),
        destinationChainId: parseInt(options.request.tokensOut[0].network.chainId.toString()),
        inputToken: fromNetworkUSDC,
        message: options.destinationNetworkCallData || "0x",
        receiverAddress,
        gasLimit
      }
    })
    : null

  if (!bridgeAggregatorResponse) {
    options.sdkConfig.debugLogListener?.("BridgeAggregation: Aggregator not configured or not responded")
    options.sdkConfig.debugLogListener?.("BridgeAggregation: Using fallback internal computation logic")

    const bridgeIface = BridgeFaucet__factory.createInterface()

    const fallbackCalldata = bridgeIface.encodeFunctionData("sendStargateV2", [
      contractAddresses.stargateUSDCPool(options.request.tokenIn.network),
      stargateNetworksMapping(options.request.tokensOut[0].network),
      amountLD,
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
    + bridgeAggregatorResponse.content.source)

  options.sdkConfig.debugLogListener?.("BridgeAggregation: Bridge transaction price impact "
    + `is ${ bridgeAggregatorResponse.content.prices.impact }%`)


  return {
    valueToSend: Amount.from(bridgeAggregatorResponse.content.valueToSend, 18, false),
    bridgeCallData: bridgeAggregatorResponse.content.callData,
    bridgeName: bridgeAggregatorResponse.content.source
  }
}