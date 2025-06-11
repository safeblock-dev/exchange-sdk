import { Address, Amount } from "@safeblock/blockchain-utils"
import runSingleChainTests from "~/__specs__/utils/run-single-chain-tests"
import { PriceStorageExtension } from "~/extensions"
import { SdkException } from "~/index"
import { bnbDAI, bnbUSDT, sdkConfig } from "./utils/sdk-test-config"
import SafeBlockSDK from "~/sdk"
import { ExchangeRequest } from "~/types"
import { describe, expect, it } from "vitest"

describe("Single chain exchanges in Ethereum networks", async () => {
  const sdk = new SafeBlockSDK(sdkConfig)

  const amountOutInitial = new Amount(1, bnbDAI.decimals, true)
  const request: ExchangeRequest = {
    exactInput: true,
    amountIn: new Amount(100, bnbUSDT.decimals, true),
    amountsOut: [amountOutInitial],
    amountOutReadablePercentages: [100],
    tokenIn: bnbUSDT,
    tokensOut: [bnbDAI],
    slippageReadablePercent: 1,
    smartRouting: true
  }

  await sdk.extension(PriceStorageExtension).forceRefetch()
  await sdk.extension(PriceStorageExtension).waitInitialFetch(1000)

  const routes = await sdk.findRoute(request)

  if (routes instanceof Error) {
    throw new Error("routes must not be an error: " + routes.message)
  }

  await runSingleChainTests(request, routes, sdk)

  const reverseRequest: ExchangeRequest = {
    exactInput: false,
    amountIn: new Amount(0, bnbUSDT.decimals, true),
    amountsOut: [new Amount(110, bnbDAI.decimals, true)],
    amountOutReadablePercentages: [100],
    tokenIn: bnbUSDT,
    tokensOut: [bnbDAI],
    slippageReadablePercent: 1
  }

  const reverseRoutes = await sdk.findRoute(reverseRequest)

  it("should not return error on correct reverse request", () => {
    expect(reverseRoutes).not.toBeInstanceOf(Error)
  })

  if (reverseRoutes instanceof SdkException) {
    throw new Error("routes reverse must not be an error: " + reverseRoutes.message)
  }

  const reverseQuota = await sdk.createQuotaFromRoute(Address.from(Address.evmBurnAddress), reverseRoutes)

  if (reverseQuota instanceof SdkException) {
    throw new Error("routes reverse must not be an error: " + reverseQuota.message)
  }

  it("should return adequate amount out value in reverse quota", () => {
    expect(reverseQuota.amountIn.toReadableBigNumber().gt(100)).toBeTruthy()
  })
})
