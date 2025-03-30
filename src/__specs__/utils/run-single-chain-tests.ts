import { Address } from "@safeblock/blockchain-utils"
import { expect, it } from "vitest"
import SafeBlock from "~/sdk"
import { ExchangeRequest, SimulatedRoute } from "~/types"

export default async function runSingleChainTests(request: ExchangeRequest, route: SimulatedRoute, sdk: SafeBlock, maxPI = 99) {
  const quota = await sdk.createQuotaFromRoute(Address.from(Address.evmBurnAddress), route)

  it("should not return error on correct request", () => {
    expect(route).not.toBeInstanceOf(Error)
  })

  it("should compute correct price impact for known tokens", () => {
    expect(Math.max(...route.priceImpactPercents.map(Math.abs))).toBeLessThan(maxPI)
    expect(Math.min(...route.priceImpactPercents.map(Math.abs))).toBeGreaterThan(0)
  })

  it("should return routes in same network", () => {
    expect(route.tokenIn.network.name).toEqual(route.tokensOut[0].network.name)
  })

  it("should compute correct output amount", () => {
    expect(route.amountsOut[0].toReadableBigNumber().toFixed()).not.toEqual(request.amountsOut[0].toReadableBigNumber().toFixed())
  })

  it("should build quota", () => {
    if (quota instanceof Error) {
      throw new Error("quota must not be an error: " + quota.message)
    }
  })
}
