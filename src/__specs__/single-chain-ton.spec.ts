import { Address, Amount } from "@safeblock/blockchain-utils"
import { sdkConfig, tonDOGS, tonUSDT } from "./utils/sdk-test-config"
import SafeBlockSDK from "~/sdk"
import { ExchangeRequest } from "~/types"
import { describe, it, expect } from "vitest"

describe("Single chain exchanges in Ton networks", async () => {
  const sdk = new SafeBlockSDK(sdkConfig)

  const amountOutInitial = new Amount(1, tonDOGS.decimals, true)
  const request: ExchangeRequest = {
    exactInput: true,
    amountIn: new Amount(100, tonUSDT.decimals, true),
    amountOut: amountOutInitial,
    tokenIn: tonUSDT,
    tokenOut: tonDOGS,
    slippageReadablePercent: 1
  }

  const routes = await sdk.findRoutes(request)

  if (routes instanceof Error) {
    throw new Error("routes must not be an error: " + routes.message)
  }

  it("should compute correct price impact for known tokens", async () => {
    expect(Math.abs(routes[0].priceImpactPercent)).toBeLessThan(99)
    expect(Math.abs(routes[0].priceImpactPercent)).toBeGreaterThan(0)
  })

  it("should not return error on correct request", async () => {
    expect(routes).not.toBeInstanceOf(Error)
  })

  it("should return at least one route", async () => {
    expect(routes.length).toBeGreaterThan(0)
  })

  it("should compute correct output amount", async () => {
    expect(routes[0].amountOut.toString()).not.toEqual(request.amountOut.toString())
  })

  it("should return routes in same network", async () => {
    expect(routes[0].tokenIn.network.name).toEqual(routes[0].tokenOut.network.name)
  })

  it("should build quota", async () => {
    const quota = await sdk.createQuota(Address.from(Address.tonBounceableNativeAddress), routes[0])

    if (quota instanceof Error) {
      throw new Error("quota must not be an error: " + quota.message)
    }
  })
})