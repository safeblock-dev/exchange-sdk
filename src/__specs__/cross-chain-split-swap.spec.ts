import { Amount } from "@safeblock/blockchain-utils"
import BigNumber from "bignumber.js"
import { PriceStorageExtension } from "~/extensions"
import {
  bnbDAI,
  bnbUSDT,
  maticMATIC,
  maticUSDC,
  maticUSDT,
  sdkConfig
} from "./utils/sdk-test-config"
import SafeBlockSDK from "~/sdk"
import { ExchangeRequest } from "~/types"
import { describe, expect, it } from "vitest"

describe("Cross chain split swap exchanges", async () => {
  const sdk = new SafeBlockSDK(sdkConfig)

  const amountOutInitial = new Amount(1, bnbDAI.decimals, true)
  const request: ExchangeRequest = {
    exactInput: true,
    amountIn: new Amount(10, bnbUSDT.decimals, true),
    amountsOut: [amountOutInitial, amountOutInitial],
    amountOutReadablePercentages: [33.3333333333333300, 33.3333333333333300, 33.3333333333333300],
    tokenIn: bnbUSDT,
    tokensOut: [maticMATIC, maticUSDC, maticUSDT],
    slippageReadablePercent: 1
  }

  await sdk.extension(PriceStorageExtension).waitInitialFetch(1000)
  await sdk.extension(PriceStorageExtension).forceRefetch()

  const route = await sdk.findRoute(request)


  if (route instanceof Error) {
    throw new Error("route must not be an error: " + route.message)
  }

  const expectedMaticByPrice = new BigNumber(3.3).div(sdk.extension(PriceStorageExtension)
    .getPrice(maticMATIC.network, maticMATIC.address).toReadableBigNumber())

  const expectedUSDC = request.amountIn.toReadableBigNumber().div(3)

  it("each amount should be less than half of the input", () => {
    expect(route.amountsOut[0].lte(expectedMaticByPrice.multipliedBy(1.02))).toBeTruthy()
    expect(route.amountsOut[1].lte(expectedUSDC.multipliedBy(1.01))).toBeTruthy()
    expect(route.amountsOut[2].lte(expectedUSDC.multipliedBy(1.02))).toBeTruthy()
  })

  it("each amount should be greater than half of the input with subtracted price impact", () => {
    expect(route.amountsOut[0].gt(expectedMaticByPrice.multipliedBy(0.97))).toBeTruthy()
    expect(route.amountsOut[1].gt(expectedUSDC.multipliedBy(0.99))).toBeTruthy()
    expect(route.amountsOut[2].gt(expectedUSDC.multipliedBy(0.98))).toBeTruthy()
  })
})
