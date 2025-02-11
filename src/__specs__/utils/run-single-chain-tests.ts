import { Address } from "@safeblock/blockchain-utils"
import { expect, it } from "vitest"
import SafeBlock from "~/sdk"
import { ExchangeRequest, SimulatedRoute } from "~/types"

export default function runSingleChainTests(request: ExchangeRequest, routes: SimulatedRoute[], sdk: SafeBlock, maxPI = 99) {
  it("should not return error on correct request", () => {
    expect(routes).not.toBeInstanceOf(Error)
  })

  it("should return at least one route", () => {
    expect(routes.length).toBeGreaterThan(0)
  })

  it("should compute correct price impact for known tokens", () => {
    expect(Math.abs(routes[0].priceImpactPercent)).toBeLessThan(maxPI)
    expect(Math.abs(routes[0].priceImpactPercent)).toBeGreaterThan(0)
  })

  it("should return routes in same network", () => {
    expect(routes[0].tokenIn.network.name).toEqual(routes[0].tokenOut.network.name)
  })

  it("should compute correct output amount", () => {
    expect(routes[0].amountOut.toString()).not.toEqual(request.amountOut.toString())
  })

  it("should build quota", async () => {
    const quota = await sdk.createQuotaFromRoute(Address.from(Address.evmBurnAddress), routes[0])

    if (quota instanceof Error) {
      throw new Error("quota must not be an error: " + quota.message)
    }
  })
}