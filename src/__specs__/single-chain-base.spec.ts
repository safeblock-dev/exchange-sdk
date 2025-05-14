import { Amount } from "@safeblock/blockchain-utils"
import runSingleChainTests from "~/__specs__/utils/run-single-chain-tests"
import { PriceStorageExtension } from "~/extensions"
import { baseUSDC, baseWETH, sdkConfig } from "./utils/sdk-test-config"
import SafeBlockSDK from "~/sdk"
import { ExchangeRequest } from "~/types"
import { describe } from "vitest"

describe("Single chain exchanges in BASE network", async () => {
  const sdk = new SafeBlockSDK(sdkConfig)

  const amountOutInitial = new Amount(1, baseWETH.decimals, true)
  const request: ExchangeRequest = {
    exactInput: true,
    amountIn: new Amount(10, baseUSDC.decimals, true),
    amountsOut: [amountOutInitial],
    amountOutReadablePercentages: [100],
    tokenIn: baseUSDC,
    tokensOut: [baseWETH],
    slippageReadablePercent: 1
  }

  //it("should contain USDC even if not provided in config", () => {
  //  const _usdc = contractAddresses.usdcParams(base)
  //  const isUSDCExist = sdk.extension(TokensListExtension).exist({
  //    address: Address.from(_usdc.address),
  //    decimals: _usdc.decimals,
  //    network: base
  //  })
  //
  //  expect(tokensListExtensionConfig[base.name].some(t => t.address.equalTo(_usdc.address))).toBeFalsy()
  //  expect(isUSDCExist).toBeTruthy()
  //})

  await sdk.extension(PriceStorageExtension).forceRefetch()
  await sdk.extension(PriceStorageExtension).waitInitialFetch(1000)
  const routes = await sdk.findRoute(request)

  if (routes instanceof Error) {
    throw new Error("routes must not be an error: " + routes.message)
  }

  await runSingleChainTests(request, routes, sdk, 101)
})
