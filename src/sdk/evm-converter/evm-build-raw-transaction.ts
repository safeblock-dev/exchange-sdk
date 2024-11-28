import { Address } from "@safeblock/blockchain-utils"
import BigNumber from "bignumber.js"
import { Entrypoint__factory, MultiswapRouterFaucet__factory, TransferFaucet__factory } from "~/abis/types"
import { SimulatedRoute } from "~/types"
import convertPairsToHex from "~/utils/convert-pairs-to-hex"

export default async function evmBuildRawTransaction(from: Address, route: SimulatedRoute) {
  const pairsHex = convertPairsToHex(route.originalRoute)

  const multiSwapIface = MultiswapRouterFaucet__factory.createInterface()

  const multiSwapData = multiSwapIface.encodeFunctionData("multiswap", [
    {
      amountIn: route.amountIn.toBigInt(),
      minAmountOut: new BigNumber(100)
        .minus(route.slippageReadablePercent ?? 1)
        .multipliedBy(route.amountOut.toString())
        .div(100)
        .toFixed(0),
      tokenIn: route.tokenIn.address.toString(),
      pairs: pairsHex
    }
  ])

  const transferFaucetIface = TransferFaucet__factory.createInterface()

  const destinationAddress = route.destinationAddress || from || Address.zeroAddress

  let transferData: string

  if (Address.isZero(route.tokenOut.address)) {
    transferData = transferFaucetIface.encodeFunctionData("unwrapNativeAndTransferTo", [
      destinationAddress.toString(),
      0
    ])
  } else {
    transferData = transferFaucetIface.encodeFunctionData("transferToken", [
      route.tokenOut.address.toString(),
      0,
      destinationAddress.toString()
    ])
  }

  const entryPointIface = Entrypoint__factory.createInterface()

  const multiCallData = entryPointIface.encodeFunctionData("multicall(bytes32,bytes[])", [
    "0x0000000000000000000000000000000000000000000000000000000000000024",
    [
      multiSwapData,
      transferData
    ]
  ])

  return {
    multiSwapData,
    transferData,
    multiCallData
  }
}