import { Address, Amount, ethersProvider, networksList } from "@safeblock/blockchain-utils"
import BigNumber from "bignumber.js"
import { BridgeFaucet__factory } from "~/abis/types"
import { contractAddresses, stargateNetworksMapping } from "~/config"
import { PriceStorageExtension } from "~/extensions"
import SdkCore from "~/sdk/sdk-core"
import SdkException, { SdkExceptionCode } from "~/sdk/sdk-exception"
import { AggregationModuleRequestParams, AggregationModuleResponse } from "~/types"

export default async function stargateAggregationModule(
  sdk: SdkCore,
  params: AggregationModuleRequestParams
): Promise<SdkException | AggregationModuleResponse> {
  const priceStorage = sdk.extension(PriceStorageExtension)

  const bridgeIface = BridgeFaucet__factory.createInterface()

  const dstNet = Array.from(networksList).find(n => n.chainId.toString() === params.destinationChainId.toString())
  const srcNet = Array.from(networksList).find(n => n.chainId.toString() === params.sourceChainId.toString())

  if (!srcNet || !dstNet)
    return new SdkException("Invalid network", SdkExceptionCode.InvalidRequest)

  const $usdc = contractAddresses.usdcParams(dstNet)

  const dstTokenPrice = priceStorage.getPrice({
    network: dstNet,
    address: Address.from($usdc.address),
    decimals: $usdc.decimals
  })

  const srcTokenPrice = priceStorage.getPrice({
    network: srcNet,
    address: params.inputToken.address,
    decimals: params.inputToken.decimals
  })

  const nativePrice = priceStorage.getPrice({
    network: srcNet,
    address: Address.zeroAddress,
    decimals: 18
  })


  if (!dstTokenPrice || !srcTokenPrice || !nativePrice)
    return new SdkException("Failed to get prices", SdkExceptionCode.InternalError)

  const entryPoint = BridgeFaucet__factory.connect(contractAddresses.entryPoint(srcNet), ethersProvider(srcNet))

  const callData = bridgeIface.encodeFunctionData("sendStargateV2", [
    contractAddresses.stargateUSDCPool(srcNet),
    stargateNetworksMapping(dstNet),
    params.receiverAddress,
    parseInt(params.gasLimit),
    params.message
  ])

  const { valueToSend, dstAmount } = await entryPoint.quoteV2(
    contractAddresses.stargateUSDCPool(srcNet),
    stargateNetworksMapping(dstNet),
    params.inputAmountRaw,
    params.receiverAddress,
    params.message,
    parseInt(params.gasLimit)
  )

  const inputAmount = Amount.from(params.inputAmountRaw, params.inputToken.decimals, false)
  const outputAmount = Amount.from(dstAmount.toString(), params.inputToken.decimals, false)

  const inputNativeAmount = Amount.from(valueToSend.toString(), 18, false)

  const inputAmountUSD = inputAmount.toReadableBigNumber().multipliedBy(srcTokenPrice.toReadableBigNumber())
  const outputAmountUSD = outputAmount.toReadableBigNumber().multipliedBy(dstTokenPrice.toReadableBigNumber())
  const inputNativeAmountUSD = inputNativeAmount.toReadableBigNumber().multipliedBy(nativePrice.toReadableBigNumber())

  const totalInputUSD = inputAmountUSD.plus(inputNativeAmountUSD)
  const priceImpact = new BigNumber(100).minus(outputAmountUSD.dividedBy(totalInputUSD).multipliedBy(100)).dp(5).toNumber()

  return {
    callData,
    valueToSend: Amount.from(valueToSend, 18, false),
    inputAmount: inputAmount,
    outputAmount: outputAmount,
    label: "stargate",
    prices: {
      input: totalInputUSD.dp(5),
      output: outputAmountUSD.dp(5),
      impact: priceImpact
    }
  }
}