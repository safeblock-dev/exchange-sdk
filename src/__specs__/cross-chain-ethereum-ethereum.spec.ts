import { Address, Amount } from "@safeblock/blockchain-utils"
import { describe, expect, it } from "vitest"
import { PriceStorageExtension } from "~/extensions"
import SafeBlockSDK from "~/sdk"
import { ExchangeRequest, SimulatedRoute } from "~/types"
import { baseUSDC, bnbDAI, bnbUSDT, maticUSDC, maticUSDT, sdkConfig } from "./utils/sdk-test-config"

describe("Cross chain exchanges from Ethereum to Ethereum", async () => {
  const sdk = new SafeBlockSDK(sdkConfig)

  const usdtTokenRequest: ExchangeRequest = {
    exactInput: true,
    amountIn: new Amount(10, maticUSDC.decimals, true),
    amountsOut: [new Amount(0, bnbUSDT.decimals, true)],
    amountOutReadablePercentages: [100],
    tokenIn: maticUSDC,
    tokensOut: [bnbUSDT],
    slippageReadablePercent: 1
  }

  const tokenTokenRequest: ExchangeRequest = {
    exactInput: true,
    amountIn: new Amount(10, bnbDAI.decimals, true),
    amountsOut: [new Amount(0, maticUSDT.decimals, true)],
    amountOutReadablePercentages: [100],
    tokenIn: bnbDAI,
    tokensOut: [maticUSDT],
    slippageReadablePercent: 1
  }

  const tokenUsdtRequest: ExchangeRequest = {
    exactInput: true,
    amountIn: new Amount(10, bnbDAI.decimals, true),
    amountsOut: [new Amount(0, baseUSDC.decimals, true)],
    amountOutReadablePercentages: [100],
    tokenIn: bnbDAI,
    tokensOut: [baseUSDC],
    slippageReadablePercent: 1
  }

  await sdk.extension(PriceStorageExtension).forceRefetch()
  await sdk.extension(PriceStorageExtension).waitInitialFetch(1000)

  const allRoutes = [
    await sdk.findRoute(usdtTokenRequest),
    await sdk.findRoute(tokenTokenRequest),
    await sdk.findRoute(tokenUsdtRequest)
  ]

  const forceNormalRoutes = allRoutes as SimulatedRoute[]

  if (allRoutes.some(r => r instanceof Error)) {
    throw new Error("routes must not be an error: " + allRoutes.find(r => r instanceof Error)?.message)
  }

  const quota = await sdk.createQuotaFromRoute(Address.from(Address.zeroAddress), forceNormalRoutes[0])

  it("should not return error on correct request", async () => {
    expect(allRoutes.some(r => r instanceof Error)).toBeFalsy()
  })

  it("should compute correct price impact for known tokens", async () => {
    forceNormalRoutes.forEach(routes => {
      expect(Math.max(...routes.priceImpactPercents.map(Math.abs))).toBeLessThan(99)
      expect(Math.min(...routes.priceImpactPercents.map(Math.abs))).toBeGreaterThan(0)
    })
  })

  it("should return routes in different network", async () => {
    forceNormalRoutes.forEach(routes => {
      expect(routes.tokenIn.network.name).not.toEqual(routes.tokensOut[0].network.name)
    })
  })

  it("should compute correct output amount", async () => {
    forceNormalRoutes.forEach(routes => {
      expect(routes.amountsOut[0].toReadable()).not.toEqual(1)
    })
  })

  it("should build quota", async () => {

    if (quota instanceof Error) {
      throw new Error("quota must not be an error: " + quota.message)
    }
  })
})
