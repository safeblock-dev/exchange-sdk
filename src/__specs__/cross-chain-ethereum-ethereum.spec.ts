import { Address, Amount } from "@safeblock/blockchain-utils"
import PriceStorageExtension from "~/extensions/price-storage-extension"
import { bnbDAI, bnbUSDT, maticUSDC, maticUSDT, sdkConfig } from "./utils/sdk-test-config"
import SafeBlockSDK from "~/sdk"
import { ExchangeRequest, SimulatedRoute } from "~/types"
import { describe, it, expect } from "vitest"

describe("Cross chain exchanges from Ethereum to Ethereum", async () => {
  const sdk = new SafeBlockSDK(sdkConfig)

  const usdtTokenRequest: ExchangeRequest = {
    exactInput: true,
    amountIn: new Amount(10, maticUSDC.decimals, true),
    amountOut: new Amount(0, bnbUSDT.decimals, true),
    tokenIn: maticUSDC,
    tokenOut: bnbUSDT,
    slippageReadablePercent: 1
  }

  const tokenTokenRequest: ExchangeRequest = {
    exactInput: true,
    amountIn: new Amount(10, bnbDAI.decimals, true),
    amountOut: new Amount(0, maticUSDT.decimals, true),
    tokenIn: bnbDAI,
    tokenOut: maticUSDT,
    slippageReadablePercent: 1
  }

  const tokenUsdtRequest: ExchangeRequest = {
    exactInput: true,
    amountIn: new Amount(10, bnbDAI.decimals, true),
    amountOut: new Amount(0, maticUSDC.decimals, true),
    tokenIn: bnbDAI,
    tokenOut: maticUSDC,
    slippageReadablePercent: 1
  }

  await sdk.extension(PriceStorageExtension).forceRefetch()
  await new Promise(r => setTimeout(r, 5_000))

  const allRoutes = [
    await sdk.findRoutes(usdtTokenRequest),
    await sdk.findRoutes(tokenTokenRequest),
    await sdk.findRoutes(tokenUsdtRequest)
  ]

  const forceNormalRoutes = allRoutes as SimulatedRoute[][]

  if (allRoutes.some(r => r instanceof Error)) {
    throw new Error("routes must not be an error: " + allRoutes.find(r => r instanceof Error)?.message)
  }

  it("should not return error on correct request", async () => {
    expect(allRoutes.some(r => r instanceof Error)).toBeFalsy()
  })

  it("should return at least one route in each request", async () => {
    expect(forceNormalRoutes.map(r => r.length).some(l => l === 0)).toBeFalsy()
  })

  it("should compute correct price impact for known tokens", async () => {
    forceNormalRoutes.forEach(routes => {
      expect(Math.abs(routes[0].priceImpactPercent)).toBeLessThan(99)
      expect(Math.abs(routes[0].priceImpactPercent)).toBeGreaterThan(0)
    })
  })

  it("should return routes in different network", async () => {
    forceNormalRoutes.forEach(routes => {
      expect(routes[0].tokenIn.network.name).not.toEqual(routes[0].tokenOut.network.name)
    })
  })

  it("should compute correct output amount", async () => {
    forceNormalRoutes.forEach(routes => {
      expect(routes[0].amountOut.toReadable()).not.toEqual(1)
    })
  })

  it("should build quota", async () => {
    const quota = await sdk.createQuotaFromRoute(Address.from(Address.zeroAddress), forceNormalRoutes[0][0])

    if (quota instanceof Error) {
      throw new Error("quota must not be an error: " + quota.message)
    }
  })
})
