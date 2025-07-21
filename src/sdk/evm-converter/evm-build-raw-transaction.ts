import { Address, Amount, ethersProvider } from "@safeblock/blockchain-utils"
import BigNumber from "bignumber.js"
import { Entrypoint__factory, MultiswapRouterFaucet__factory, Quoter__factory, TransferFaucet__factory } from "~/abis/types"
import { contractAddresses } from "~/config"
import { SdkConfig } from "~/sdk"
import { SdkMixins } from "~/sdk/sdk-mixins"
import { ExchangeRequest, SimulatedRoute } from "~/types"
import adjustPercentages from "~/utils/adjust-percentages"
import convertPairsToHex from "~/utils/convert-pairs-to-hex"

export default async function evmBuildRawTransaction(from: Address, request: ExchangeRequest, route: SimulatedRoute, mixins: SdkMixins, config: SdkConfig, crossChain = false) {
  const pairsHex = route.originalRouteSet.map(route => convertPairsToHex(route))

  const applicator = mixins.getMixinApplicator("internal").getNamespaceApplicator("createSingleChainTransaction")

  const multiSwapIface = MultiswapRouterFaucet__factory.createInterface()

  const quoterInstance = Quoter__factory.connect(contractAddresses.quoter(request.tokenIn.network, config), ethersProvider(request.tokenIn.network))

  let multiSwapData: string
  let amountIn: Amount = request.amountIn

  const replaceZero = (address: string | Address) => Address.equal(address, Address.zeroAddress) ? Address.wrappedOf(request.tokenIn.network) : Address.from(address)

  if (route.smartRoutingDetails && route.tokensOut.length === 1) multiSwapData = route.smartRoutingDetails.callData
  else {
    if (route.isExactInput || route.tokensOut.length > 1) {
      multiSwapData = multiSwapIface.encodeFunctionData("multiswap2", [
        {
          fullAmount: route.amountIn.toBigInt(),
          amountInPercentages: route.estimatedPartialPercents || adjustPercentages(route.amountOutReadablePercentages),
          minAmountsOut: route.amountsOut.map((amount, index) => {
            if (route.originalRouteSet[index].length === 0) return "0" // Tokens transfer only

            return new BigNumber(100)
              .minus(route.slippageReadablePercent ?? 1)
              .multipliedBy(amount.toString())
              .div(100)
              .toFixed(0)
          }),
          tokenIn: replaceZero(route.tokenIn.address).toString(),
          tokensOut: route.tokensOut.map(token => replaceZero(token.address).toString()),
          pairs: pairsHex
        }
      ])
    }
    else {
      const quoterResponse = await quoterInstance.multiswap2Reverse({
        fullAmount: "0",
        amountInPercentages: route.tokensOut.map(token => token.address.equalTo(Address.zeroAddress)
          ? Address.wrappedOf(token.network)
          : token.address.toString()),
        minAmountsOut: request.amountsOut.map(amount => amount.toString()),
        tokenIn: replaceZero(route.tokenIn.address).toString(),
        tokensOut: route.tokensOut.map(token => replaceZero(token.address).toString()),
        pairs: pairsHex
      })

      let quoterAmount = new BigNumber(quoterResponse.toString())
      quoterAmount = quoterAmount.multipliedBy(1 + (request.slippageReadablePercent / 100))

      amountIn = Amount.from(quoterAmount.toFixed(0), request.tokenIn.decimals, false)

      multiSwapData = multiSwapIface.encodeFunctionData("multiswapReverse", [
        {
          pairs: pairsHex,
          tokensIn: [replaceZero(route.tokenIn.address).toString()],
          tokensOut: route.tokensOut.map(token => replaceZero(token.address).toString()),
          amountsOut: request.amountsOut.map(amount => amount.toString())
        }
      ])
    }
  }

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

  const multiCallData = crossChain
    ? entryPointIface.encodeFunctionData("multicall(bytes[])", [
      [
        multiSwapData,
        ...transferData
      ]
    ])
    : entryPointIface.encodeFunctionData("multicall((address[],uint256[]),bytes[])", [
      {
        tokens: [request.tokenIn.address.toString()],
        amounts: [amountIn.toString()]
      },
      [
        multiSwapData,
        ...transferData
      ]
    ])

  return {
    multiSwapData,
    transferData,
    multiCallData,
    amountIn
  }
}
