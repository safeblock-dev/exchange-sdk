import { Address } from "@safeblock/blockchain-utils"
import BigNumber from "bignumber.js"
import { Entrypoint__factory, MultiswapRouterFaucet__factory, TransferFaucet__factory } from "~/abis/types"
import { SdkMixins } from "~/sdk/sdk-mixins"
import { SimulatedRoute } from "~/types"
import adjustPercentages from "~/utils/adjust-percentages"
import convertPairsToHex from "~/utils/convert-pairs-to-hex"

export default async function evmBuildRawTransaction(from: Address, route: SimulatedRoute, mixins: SdkMixins) {
  const pairsHex = route.originalRouteSet.map(route => convertPairsToHex(route))

  const applicator = mixins.getMixinApplicator("internal").getNamespaceApplicator("createSingleChainTransaction")

  const multiSwapIface = MultiswapRouterFaucet__factory.createInterface()

  const multiSwapData = multiSwapIface.encodeFunctionData("multiswap2", [
    {
      fullAmount: route.amountIn.toBigInt(),
      amountInPercentages: adjustPercentages(route.amountOutReadablePercentages),
      minAmountsOut: route.amountsOut.map((amount, index) => {
        if (route.originalRouteSet[index].length === 0) return "0" // Tokens transfer only

        return new BigNumber(100)
          .minus(route.slippageReadablePercent ?? 1)
          .multipliedBy(amount.toString())
          .div(100)
          .toFixed(0)
      }),
      tokenIn: route.tokenIn.address.toString(),
      tokensOut: route.tokensOut.map(token => token.address.equalTo(Address.zeroAddress)
        ? Address.wrappedOf(token.network)
        : token.address.toString()),
      pairs: pairsHex
    }
  ])

  const transferFaucetIface = TransferFaucet__factory.createInterface()

  const destinationAddress = route.destinationAddress || from || Address.zeroAddress

  let transferData: string[] = []

  if (route.tokensOut.some(token => token.address.equalTo(Address.zeroAddress))) {
    transferData.push(transferFaucetIface.encodeFunctionData("unwrapNativeAndTransferTo", [
      destinationAddress.toString()
    ]))
  }

  if (route.tokensOut.length > 1 || !route.tokensOut.some(token => token.address.equalTo(Address.zeroAddress))) {
    const applicationResult = applicator.applyMixin("tokenTransferCallDataFinalized", transferFaucetIface.encodeFunctionData("transferToken", [
      destinationAddress.toString(),
      route.tokensOut.filter(t => !t.address.equalTo(Address.zeroAddress))
        .map(t => t.address.toString())
    ]))

    transferData.push(await applicationResult)
  }

  const entryPointIface = Entrypoint__factory.createInterface()

  const multiCallData = entryPointIface.encodeFunctionData("multicall", [
    [
      multiSwapData,
      ...transferData
    ]
  ])

  return {
    multiSwapData,
    transferData,
    multiCallData
  }
}
