import { Address, ton } from "@safeblock/blockchain-utils"
import { TonClient } from "@ton/ton"
import EvmConverter from "~/sdk/evm-converter"
import { ExchangeUtils } from "~/sdk/exchange-utils"
import StateManager from "~/sdk/state-manager"
import TonConverter from "~/sdk/ton-converter"
import { ExchangeRequest, SimulatedRoute } from "~/types"
import PriceStorage from "~/utils/price-storage"
import TokensList, { BasicToken } from "~/utils/tokens-list"

export type SdkConfig = Partial<{
  tokensList: Record<string, BasicToken[]> | Map<string, BasicToken[]> | [ string, BasicToken[] ][]
  routePriceDifferenceLimit: number

  tonClient: {
    endpoint: string
    apiKey?: string
  }

  backend: {
    url: string
    headers?: Record<string, string>
  }

  priceStorage: Partial<{
    updateInterval: number
  }>
}>

export abstract class SdkInstance extends StateManager {
  public abstract sdkConfig: SdkConfig

  public abstract priceStorage: PriceStorage

  public abstract tonClient: TonClient | null

  public abstract tokensList: TokensList
}

export default class SafeBlock extends SdkInstance {
  public priceStorage: PriceStorage
  public tonClient: TonClient | null = null
  public tokensList: TokensList
  public sdkConfig: SdkConfig

  constructor(sdkConfig?: SdkConfig) {
    super()

    this.sdkConfig = sdkConfig ?? {}

    this.tokensList = new TokensList({
      initialTokens: sdkConfig?.tokensList ?? {},
      onTokenAdded: () => {
        this.priceStorage.forceRefetch().finally()
      }
    })

    this.priceStorage = new PriceStorage(this.tokensList, sdkConfig?.priceStorage?.updateInterval)

    if (sdkConfig?.tonClient?.endpoint) {
      this.tonClient = new TonClient({
        endpoint: sdkConfig.tonClient.endpoint,
        apiKey: sdkConfig.tonClient.apiKey,
      })
    }
  }

  public findRoutes(request: ExchangeRequest) {
    const converter = this.resolveConverter(request)

    return converter.fetchRoutes(request, this.currentTask)
  }

  public async createQuota(from: Address, route: SimulatedRoute) {
    const request = this.routeToRequest(route)
    const converter = this.resolveConverter(request)

    if (route.tokenIn.network === route.tokenOut.network) {
      if (ExchangeUtils.isWrapUnwrap(route)) {
        const wrapUnwrap = converter.createSingleChainWrapUnwrapTransaction(request)

        if (wrapUnwrap instanceof Error) return wrapUnwrap

        return wrapUnwrap
      }

      if (!route) return Error("Route not selected")

      const singleChainTransactions = await converter.createSingleChainTransaction(from, route, this.currentTask)

      if (singleChainTransactions instanceof Error) return singleChainTransactions

      return singleChainTransactions
    }

    return converter.createMultiChainTransaction(from, request, this.currentTask)
  }

  private resolveConverter(request: ExchangeRequest | SimulatedRoute) {
    if (request.tokenIn.network.name === ton.name || request.tokenOut.network.name === ton.name) {
      return new TonConverter(this)
    }

    return new EvmConverter(this)
  }

  private routeToRequest(route: SimulatedRoute): ExchangeRequest {
    return {
      ...route,
      exactInput: route.isExactInput
    }
  }
}
