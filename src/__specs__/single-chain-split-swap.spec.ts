import { Amount } from "@safeblock/blockchain-utils"
import runSingleChainTests from "~/__specs__/utils/run-single-chain-tests"
import { PriceStorageExtension } from "~/extensions"
import { SdkException } from "~/index"
import { bnbDAI, bnbUSDC, bnbUSDT, sdkConfig } from "./utils/sdk-test-config"
import SafeBlockSDK from "~/sdk"
import { ExchangeRequest } from "~/types"
import { describe, expect, it } from "vitest"

describe("Single chain split swap exchanges", async () => {
  const sdk = new SafeBlockSDK(sdkConfig)

  const amountOutInitial = new Amount(1, bnbDAI.decimals, true)
  const request: ExchangeRequest = {
    exactInput: true,
    amountIn: new Amount(10, bnbUSDT.decimals, true),
    amountsOut: [amountOutInitial, amountOutInitial],
    amountOutReadablePercentages: [50, 50],
    tokenIn: bnbUSDT,
    tokensOut: [bnbDAI, bnbUSDC],
    slippageReadablePercent: 1
  }

  const wrongRequest: ExchangeRequest = {
    ...request,
    exactInput: false
  }

  await sdk.extension(PriceStorageExtension).waitInitialFetch(1000)
  await sdk.extension(PriceStorageExtension).forceRefetch()

  const route = await sdk.findRoute(request)

  if (route instanceof Error) {
    throw new Error("route must not be an error: " + route.message)
  }

  const wrongResponse = await sdk.findRoute(wrongRequest)

  it("should not process split swap requests in the exact output mode", () => {
    expect(wrongResponse).toBeInstanceOf(SdkException)
  })

  await runSingleChainTests(request, route, sdk)

  it("each amount should be less than half of the input", () => {
    expect(route.amountsOut.every(amount => amount.lt(6))).toBeTruthy()
  })

  it("each amount should be greater than half of the input with subtracted price impact", () => {
    expect(route.amountsOut.every(amount => amount.gt(4.91))).toBeTruthy()
  })
})
