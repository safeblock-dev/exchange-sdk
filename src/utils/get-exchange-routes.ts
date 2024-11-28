import { Address } from "@safeblock/blockchain-utils"
import { apiNetworkNamesMapping } from "~/config"
import { BackendResponse, RouteStep } from "~/types"
import ArrayUtils from "~/utils/array-utils"
import request from "~/utils/request"
import { BasicToken } from "~/utils/tokens-list"

interface Options {
  backendUrl: string
  fromToken: BasicToken
  toToken: BasicToken
  limit?: number
  bannedDexIds?: string[]
  headers?: Record<string, string>
}

export default async function getExchangeRoutes(options: Options): Promise<RouteStep[][]> {
  const { backendUrl, fromToken, toToken, bannedDexIds, limit, headers } = options

  const rawRoutes = await request<BackendResponse.IRoutesResponse>({
    base: backendUrl,
    path: "/routes",
    headers,
    query: {
      from: Address.isZero(fromToken.address) ? Address.wrappedOf(fromToken.network) : fromToken.address.toString(),
      to: Address.isZero(toToken.address) ? Address.wrappedOf(toToken.network) : toToken.address.toString(),
      limit: limit ?? 3,
      network: apiNetworkNamesMapping(fromToken.network),
      "banned_dex_ids": bannedDexIds?.length ? bannedDexIds.join(",") : null
    }
  })

  if (!rawRoutes) return []

  const plainRoutesList = [ ...rawRoutes.items.swap.map(route => [ route ]), ...rawRoutes.items.multiswap ]

  if (plainRoutesList.length === 0) return []

  return ArrayUtils.nonNullable(
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

          token0: {
            address: Address.from(tokenA.address),
            decimals: tokenA.decimals,
            network: fromToken.network,
            fee: step.token0_fee
          },

          token1: {
            address: Address.from(tokenB.address),
            decimals: tokenB.decimals,
            network: fromToken.network,
            fee: step.token1_fee
          }
        }
      })

      if (steps.some(step => step === null)) return null

      return steps as RouteStep[]
    })
  )
}