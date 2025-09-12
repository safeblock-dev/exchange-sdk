import { Address, Amount, arbitrum, avalanche, base, ethersProvider, mainnet, matic, optimism } from "@safeblock/blockchain-utils"
import BigNumber from "bignumber.js"
import { CelerCCTPFacet__factory } from "~/abis/types"
import { contractAddresses, stargateNetworksMapping } from "~/config"
import { PriceStorageExtension } from "~/extensions"
import SdkCore, { SdkConfig } from "~/sdk/sdk-core"
import SdkException, { SdkExceptionCode } from "~/sdk/sdk-exception"
import { AggregationModuleRequestParams, AggregationModuleResponse } from "~/types"
import buildExtraData from "~/utils/build-extra-data"
import messageQuoter from "~/utils/message-quoter"

export default async function celerAggregationModule(
  sdk: SdkCore,
  sdkConfig: SdkConfig,
  params: AggregationModuleRequestParams
): Promise<SdkException | AggregationModuleResponse> {
  const supportedNetworks = [base, arbitrum, optimism, avalanche, matic, mainnet]

  if (!supportedNetworks.includes(params.inputToken.network))
    return new SdkException("Unsupported source network", SdkExceptionCode.InvalidRequest)

  if (!params.outputTokens.some(t => !supportedNetworks.includes(t.network)))
    return new SdkException("Unsupported target network", SdkExceptionCode.InvalidRequest)

  const provider = ethersProvider(params.inputToken.network)
  if (!provider) return new SdkException("Provider not found", SdkExceptionCode.InternalError)

  const celerContract = CelerCCTPFacet__factory
    .connect(contractAddresses.entryPoint(params.inputToken.network), provider)

  const amountOut = await celerContract.quoteTransfer(params.inputAmountRaw, params.inputToken.network.chainId)
    .catch(() => null)

  if (!amountOut || amountOut <= BigInt(0))
    return new SdkException("Cannot get amount out through Celer", SdkExceptionCode.InternalError)

  const dstNet = params.outputTokens[0].network

  const dstUSDC = contractAddresses.usdcParams(dstNet)
  if (!dstUSDC)
    return new SdkException("Cannot get USDC address", SdkExceptionCode.InternalError)

  const extraData = buildExtraData(params)

  const callData = celerContract.interface.encodeFunctionData("sendCircleBridge", [
    dstNet.chainId,
    params.outputTokens[0].address.equalTo(contractAddresses.usdcParams(dstNet).address)
      ? params.receiverAddress
      : Address.zeroAddress.toString(),
    stargateNetworksMapping(dstNet),
    dstUSDC.address.toString(),
    extraData
  ])

  const inputAmount = Amount.from(params.inputAmountRaw, params.inputToken.decimals, false)
  const outputAmount = Amount.from(amountOut.toString(), dstUSDC.decimals, false)

  const nativeAmount = new BigNumber(Address.equal(params.inputToken.address, Address.zeroAddress) ? params.inputAmountRaw : "0")

  const extraNative = await messageQuoter(
    params.inputToken.network,
    sdkConfig,
    stargateNetworksMapping(dstNet),
    extraData
  )

  if (extraNative instanceof SdkException) return extraNative

  const priceStorage = sdk.extension(PriceStorageExtension)

  const $usdc = contractAddresses.usdcParams(dstNet)

  const dstTokenPrice = priceStorage.getPrice({
    network: dstNet,
    address: Address.from($usdc.address),
    decimals: $usdc.decimals
  })

  const srcTokenPrice = priceStorage.getPrice({
    network: params.inputToken.network,
    address: params.inputToken.address,
    decimals: params.inputToken.decimals
  })

  const inputAmountUSD = inputAmount.toReadableBigNumber().multipliedBy(srcTokenPrice.toReadableBigNumber())
  const outputAmountUSD = outputAmount.toReadableBigNumber().multipliedBy(dstTokenPrice.toReadableBigNumber())

  const totalInputUSD = inputAmountUSD
  const priceImpact = new BigNumber(100).minus(outputAmountUSD.dividedBy(totalInputUSD).multipliedBy(100)).dp(5).toNumber()

  return {
    callData,
    valueToSend: Amount.from(nativeAmount.plus(extraNative).toFixed(0), 18, false),
    inputAmount: inputAmount,
    outputAmount: outputAmount,
    label: "celer",
    prices: {
      input: totalInputUSD.dp(5),
      output: outputAmountUSD.dp(5),
      impact: priceImpact
    }
  }
}