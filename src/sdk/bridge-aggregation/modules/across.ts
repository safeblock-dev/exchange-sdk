import { Address, Amount, networksList } from "@safeblock/blockchain-utils"
import BigNumber from "bignumber.js"
import { AcrossABI__factory } from "~/abis/types"
import { PriceStorageExtension } from "~/extensions"
import { AcrossTokenDetails, SuggestedFeeApiResponse } from "~/sdk/bridge-aggregation/modules/across.types"
import SdkCore from "~/sdk/sdk-core"
import SdkException, { SdkExceptionCode } from "~/sdk/sdk-exception"
import { AggregationModuleRequestParams, AggregationModuleResponse } from "~/types"

let tokenManifestCache: Map<string, AcrossTokenDetails[]> = new Map()

export default async function acrossAggregationModule(sdk: SdkCore, params: AggregationModuleRequestParams): Promise<SdkException | AggregationModuleResponse> {
  const urlParams = new URLSearchParams()

  let acrossToken: AcrossTokenDetails | null = null

  if (tokenManifestCache.has(params.sourceChainId.toString())) {
    acrossToken = (tokenManifestCache.get(params.sourceChainId.toString()) ?? []).find(t => t.originChainId === params.sourceChainId
      && t.destinationChainId === params.destinationChainId
      && Address.equal(t.originToken, params.inputToken.address)) ?? null
  }
  else {
    try {
      const tokensListURL = "https://raw.githubusercontent.com/safeblock-com/dex-content/refs/heads"
        + `/main/aggregation/across/manifest/${ params.sourceChainId.toString() }.json`

      const tokensListResponse = await fetch(tokensListURL)

      if (!tokensListResponse.ok) return new SdkException("Failed to fetch Across tokens list", SdkExceptionCode.RoutesNotFound)

      const tokensList = await tokensListResponse.json() as AcrossTokenDetails[]

      tokenManifestCache.set(params.sourceChainId.toString(), tokensList)

      acrossToken = (tokensList.find(t => t.originChainId === params.sourceChainId
          && t.destinationChainId === params.destinationChainId
          && Address.equal(t.originToken, params.inputToken.address)) ?? null
      )
    }
    catch {
      return new SdkException("Failed to parse Across tokens list", SdkExceptionCode.RoutesNotFound)
    }
  }
  if (!acrossToken) return new SdkException("No matching token found", SdkExceptionCode.RoutesNotFound)

  const srcNet = Array.from(networksList).find(n => n.chainId.toString() === params.sourceChainId.toString())
  const dstNet = Array.from(networksList).find(n => n.chainId.toString() === params.destinationChainId.toString())

  if (!srcNet || !dstNet) return new SdkException("Invalid network", SdkExceptionCode.InvalidRequest)

  const priceStorage = sdk.extension(PriceStorageExtension)

  const dstTokenPrice = priceStorage.getPrice({
    network: dstNet,
    address: Address.from(acrossToken.destinationToken),
    decimals: params.inputToken.decimals
  })

  const srcTokenPrice = priceStorage.getPrice({
    network: srcNet,
    address: params.inputToken.address,
    decimals: params.inputToken.decimals
  })

  if (!dstTokenPrice || !srcTokenPrice) return new SdkException("Failed to get prices", SdkExceptionCode.InternalError)

  urlParams.set("inputToken", Address.equal(Address.zeroAddress, params.inputToken.address) ? Address.wrappedOf(srcNet).toString() : params.inputToken.address.toString())
  urlParams.set("outputToken", acrossToken.destinationToken)
  urlParams.set("originChainId", params.sourceChainId.toString())
  urlParams.set("destinationChainId", params.destinationChainId.toString())
  urlParams.set("amount", params.inputAmountRaw)

  const baseURL = "https://app.across.to/api"

  const suggestedFeesRequest = await fetch(`${ baseURL }/suggested-fees?${ urlParams.toString() }`)

  if (!suggestedFeesRequest.ok) {
    const message = await suggestedFeesRequest.json()

    return new SdkException(message?.message || "Failed to fetch suggested fees", SdkExceptionCode.InternalError)
  }

  const suggestedFee = await suggestedFeesRequest.json() as SuggestedFeeApiResponse

  const acrossContractIface = AcrossABI__factory.createInterface()

  const callData = acrossContractIface.encodeFunctionData("sendAcrossDepositV3", [{
    recipient: params.receiverAddress,
    inputToken: params.inputToken.address.toString(),
    outputToken: acrossToken.destinationToken,
    inputAmount: params.inputAmountRaw,
    outputAmountPercent: BigInt(1e18) - BigInt(String(suggestedFee.totalRelayFee.pct)),
    destinationChainId: params.destinationChainId.toString(),
    exclusiveRelayer: suggestedFee.exclusiveRelayer,
    quoteTimestamp: suggestedFee.timestamp,
    fillDeadline: suggestedFee.fillDeadline,
    exclusivityDeadline: suggestedFee.exclusivityDeadline,
    message: params.message.length > 2 ? ("0x" + params.message.slice(130 + 128)) : params.message
  }])

  const inputAmount = Amount.from(params.inputAmountRaw, params.inputToken.decimals, false)
  const outputAmount = Amount.from(suggestedFee.outputAmount, params.inputToken.decimals, false)

  const inputAmountUSD = inputAmount.toReadableBigNumber().multipliedBy(srcTokenPrice.toReadableBigNumber())
  const outputAmountUSD = outputAmount.toReadableBigNumber().multipliedBy(dstTokenPrice.toReadableBigNumber())

  return {
    callData,
    valueToSend: Amount.from(Address.equal(params.inputToken.address, Address.zeroAddress) ? params.inputAmountRaw : "0", 18, false),
    inputAmount: inputAmount,
    outputAmount: outputAmount,
    label: "across",
    prices: {
      input: inputAmountUSD.dp(5),
      output: outputAmountUSD.dp(5),
      impact: new BigNumber(100).minus(outputAmountUSD.dividedBy(inputAmountUSD).multipliedBy(100)).dp(5).toNumber()
    }
  }
}