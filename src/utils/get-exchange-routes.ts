import { Address, arrayUtils } from "@safeblock/blockchain-utils"
import { BackendResponse, RouteStep } from "~/types"
import LimitedMap from "~/utils/limited-map"
import request from "~/utils/request"
import { BasicToken } from "~/types"
import IRoutesResponse = BackendResponse.IRoutesResponse

interface Options {
  backendUrl: string
  fromToken: BasicToken
  toToken: BasicToken
  limit?: number
  bannedDexIds?: string[]
  headers?: Record<string, string>
}

const routesCache = new LimitedMap<string, IRoutesResponse>(10_000)

export default async function getExchangeRoutes(options: Options): Promise<RouteStep[][]> {
  const { backendUrl, fromToken, toToken, bannedDexIds, limit, headers } = options

  const routeKey = options.fromToken.address.toString() + options.toToken.address.toString()
    + options.fromToken.network.name + options.toToken.network.name
    + options.limit + options.bannedDexIds?.join(",")

  const cachedRoute = routesCache.get(routeKey)

  let rawRoutes: IRoutesResponse | null
  if (cachedRoute) rawRoutes = cachedRoute
  else {
    rawRoutes = await request<BackendResponse.IRoutesResponse>({
      base: backendUrl,
      path: "/routes",
      headers,
      query: {
        from: Address.isZero(fromToken.address) ? Address.wrappedOf(fromToken.network) : fromToken.address.toString(),
        to: Address.isZero(toToken.address) ? Address.wrappedOf(toToken.network) : toToken.address.toString(),
        limit: limit ?? 3,
        network: fromToken.network.chainId.toString(),
        "banned_dex_ids": bannedDexIds?.length ? bannedDexIds.join(",") : null
      }
    })

    if (rawRoutes) routesCache.set(routeKey, rawRoutes, 3_600_000)
  }

  if (!rawRoutes) return []

  const plainRoutesList = [ ...rawRoutes.items.swap.map(route => [ route ]), ...rawRoutes.items.multiswap ]

  if (plainRoutesList.length === 0) return []

  return arrayUtils.nonNullable(
    plainRoutesList.map(plainRoute => {
      const steps: (null | RouteStep)[] = plainRoute.map(step => {
        const tokenA = rawRoutes.tokens[step.token0_id]
        const tokenB = rawRoutes.tokens[step.token1_id]

        if (!tokenA || !tokenB) return null

        return {
          address: Address.from(step.address),
          exchange_id: step.exchange_id,
          fee: step.fee,
          version: step.version,
          fee_type: "none",

          token0: {
            address: Address.from(tokenA.address),
            decimals: tokenA.decimals,
            network: fromToken.network,
          },

          token1: {
            address: Address.from(tokenB.address),
            decimals: tokenB.decimals,
            network: fromToken.network,
          }
        }
      })

      if (steps.some(step => step === null)) return null

      return steps as RouteStep[]
    })
  )
}
