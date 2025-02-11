import { Amount } from "@safeblock/blockchain-utils"
import runSingleChainTests from "~/__specs__/utils/run-single-chain-tests"
import { baseUSDC, baseWETH, bnbDAI, sdkConfig } from "./utils/sdk-test-config"
import SafeBlockSDK from "~/sdk"
import { ExchangeRequest } from "~/types"
import { describe } from "vitest"

describe("Single chain exchanges in BASE network", async () => {
  const sdk = new SafeBlockSDK(sdkConfig)

  const amountOutInitial = new Amount(1, bnbDAI.decimals, true)
  const request: ExchangeRequest = {
    exactInput: true,
    amountIn: new Amount(10, baseUSDC.decimals, true),
    amountOut: amountOutInitial,
    tokenIn: baseUSDC,
    tokenOut: baseWETH,
    slippageReadablePercent: 1
  }

  await sdk.priceStorage.forceRefetch()
  await sdk.priceStorage.waitInitialFetch(1000)

  const routes = await sdk.findRoutes(request)

  if (routes instanceof Error) {
    throw new Error("routes must not be an error: " + routes.message)
  }

  runSingleChainTests(request, routes, sdk, 101)
})
