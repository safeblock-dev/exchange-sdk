import { Address, Amount } from "@safeblock/blockchain-utils"
import { bnbDAI, maticUSDT, sdkConfig, tonDOGS, tonUSDT } from "./utils/sdk-test-config"
import SafeBlockSDK from "~/sdk"
import { ExchangeRequest, SimulatedRoute } from "~/types"
import { describe, it, expect } from "vitest"

describe("Cross chain exchanges from Ton to Ethereum networks", async () => {
  const sdk = new SafeBlockSDK(sdkConfig)

  const usdtTokenRequest: ExchangeRequest = {
    exactInput: true,
    amountIn: new Amount(100, tonUSDT.decimals, true),
    amountOut: new Amount(1, bnbDAI.decimals, true),
    tokenIn: tonUSDT,
    tokenOut: bnbDAI,
    slippageReadablePercent: 1
  }

  const tokenTokenRequest: ExchangeRequest = {
    exactInput: true,
    amountIn: new Amount(6000, tonDOGS.decimals, true),
    amountOut: new Amount(1, bnbDAI.decimals, true),
    tokenIn: tonDOGS,
    tokenOut: bnbDAI,
    slippageReadablePercent: 1
  }

  const tokenUsdtRequest: ExchangeRequest = {
    exactInput: true,
    amountIn: new Amount(6000, tonDOGS.decimals, true),
    amountOut: new Amount(1, maticUSDT.decimals, true),
    tokenIn: tonDOGS,
    tokenOut: maticUSDT,
    slippageReadablePercent: 1
  }

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
    const quota = await sdk.createQuota(Address.from(Address.tonBounceableNativeAddress), forceNormalRoutes[0][0])

    if (quota instanceof Error) {
      throw new Error("quota must not be an error: " + quota.message)
    }
  })
})
