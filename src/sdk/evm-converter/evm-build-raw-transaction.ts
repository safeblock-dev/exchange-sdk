import { Address } from "@safeblock/blockchain-utils"
import BigNumber from "bignumber.js"
import { Entrypoint__factory, MultiswapRouterFaucet__factory, TransferFaucet__factory } from "~/abis/types"
import { SimulatedRoute } from "~/types"
import convertPairsToHex from "~/utils/convert-pairs-to-hex"
import request from "~/utils/request"

export default async function evmBuildRawTransaction(from: Address, route: SimulatedRoute) {
  const pairsHex = convertPairsToHex(route.originalRoute)

  const multiSwapIface = MultiswapRouterFaucet__factory.createInterface()

  const multiSwapData = multiSwapIface.encodeFunctionData("multiswap2", [
    {
      fullAmount: route.amountIn.toBigInt(),
      amountInPercentages: [
        BigInt(1e18)
      ],
      minAmountsOut: [
        new BigNumber(100)
          .minus(route.slippageReadablePercent ?? 1)
          .multipliedBy(route.amountOut.toString())
          .div(100)
          .toFixed(0)
      ],
      tokenIn: route.tokenIn.address.toString(),
      tokensOut: [
        route.tokenOut.address.toString()
      ],
      pairs: [
        pairsHex
      ]
    }
  ])

  const transferFaucetIface = TransferFaucet__factory.createInterface()

  const destinationAddress = route.destinationAddress || from || Address.zeroAddress

  let transferData: string

  if (Address.isZero(route.tokenOut.address)) {
    transferData = transferFaucetIface.encodeFunctionData("unwrapNativeAndTransferTo", [
      destinationAddress.toString()
    ])
  } else {
    transferData = transferFaucetIface.encodeFunctionData("transferToken", [
      destinationAddress.toString(),
      [
        route.tokenOut.address.toString()
      ]
    ])
  }

  const entryPointIface = Entrypoint__factory.createInterface()

  const multiCallData = entryPointIface.encodeFunctionData("multicall", [
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
