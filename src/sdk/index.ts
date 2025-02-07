import { Address } from "@safeblock/blockchain-utils"
import EvmConverter from "~/sdk/evm-converter"
import { ExchangeUtils } from "~/sdk/exchange-utils"
import StateManager from "~/sdk/state-manager"
import { ExchangeRequest, SimulatedRoute } from "~/types"
import PriceStorage from "~/utils/price-storage"
import TokensList, { BasicToken } from "~/utils/tokens-list"

export type SdkConfig = Partial<{
  tokensList: Record<string, BasicToken[]> | Map<string, BasicToken[]> | [ string, BasicToken[] ][]
  routePriceDifferenceLimit: number

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

  public abstract tokensList: TokensList
}

export default class SafeBlock extends SdkInstance {
  public priceStorage: PriceStorage
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
  }

  public findRoutes(request: ExchangeRequest) {
    const converter = this.resolveConverter()

    return converter.fetchRoutes(request, this.currentTask)
  }

  public async createQuota(from: Address, route: SimulatedRoute) {
    const request = this.routeToRequest(route)
    const converter = this.resolveConverter()

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

  private resolveConverter() {
    return new EvmConverter(this)
  }

  private routeToRequest(route: SimulatedRoute): ExchangeRequest {
    return {
      ...route,
      exactInput: route.isExactInput
    }
  }
}
