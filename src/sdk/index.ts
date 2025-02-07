import { Address } from "@safeblock/blockchain-utils"
import BigNumber from "bignumber.js"
import { ethers, JsonRpcSigner } from "ethers"
import EvmConverter from "~/sdk/evm-converter"
import { ExchangeUtils } from "~/sdk/exchange-utils"
import StateManager from "~/sdk/state-manager"
import { ExchangeRequest, ExecutorCallData, SimulatedRoute } from "~/types"
import PriceStorage from "~/utils/price-storage"
import SdkException, { SdkExceptionCode } from "~/utils/sdk-exception"
import TokensList, { BasicToken } from "~/utils/tokens-list"

export type SdkConfig = Partial<{
  tokensList: Record<string, BasicToken[]> | Map<string, BasicToken[]> | [string, BasicToken[]][]
  routePriceDifferenceLimit: number

  backend: {
    url: string
    headers?: Record<string, string>
  }

  priceStorage: Partial<{
    updateInterval: number
  }>
}>

type GenericBlacklist<I extends string, S extends string> = Array<{ [key: string]: any } & { [key in I]: string } & { [key in S]: boolean }>

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
      onTokenAdded: token => {
        this.priceStorage.forceRefetch().finally()
        this.emitEvent("tokenAdded", token)
      },
      onTokenRemoved: token => this.emitEvent("tokenRemoved", token)
    })

    this.priceStorage = new PriceStorage(this.tokensList, sdkConfig?.priceStorage?.updateInterval, prices => {
      this.emitEvent("pricesUpdated", prices)
    })

    this.priceStorage.waitInitialFetch(100).then(() => this.emitEvent("initialized", this))
  }

  public findRoutes(request: ExchangeRequest) {
    const converter = this.resolveConverter()

    return converter.fetchRoutes(request, this.currentTask)
  }

  public async createQuotaFromRoute(from: Address, route: SimulatedRoute) {
    const request = this.routeToRequest(route)
    const converter = this.resolveConverter()

    if (route.tokenIn.network === route.tokenOut.network) {
      if (ExchangeUtils.isWrapUnwrap(route)) {
        const wrapUnwrap = converter.createSingleChainWrapUnwrapTransaction(request)

        if (wrapUnwrap instanceof SdkException) return wrapUnwrap

        return wrapUnwrap
      }

      if (!route) return new SdkException("Route not selected", SdkExceptionCode.InvalidRequest)

      const singleChainTransactions = await converter.createSingleChainTransaction(from, route, this.currentTask)

      if (singleChainTransactions instanceof SdkException) return singleChainTransactions

      return singleChainTransactions
    }

    return converter.createMultiChainTransaction(from, request, this.currentTask)
  }

  public syncDexBlacklists<I extends string, S extends string>(idFieldName: I, stateFieldName: S, list: GenericBlacklist<I, S>) {
    this.dexBlacklist.clear()
    list.forEach(item => {
      const id = item[idFieldName]
      const state = item[stateFieldName]

      if (!state) this.dexBlacklist.add(id)
    })
  }

  public async createQuota(from: Address, request: ExchangeRequest, task: symbol) {
    const routes = await this.findRoutes(request)

    if (!this.verifyTask(task)) return new SdkException("Task aborted", SdkExceptionCode.Aborted)

    if (routes instanceof SdkException) return routes
    if (routes.length === 0) return new SdkException("Routes not found", SdkExceptionCode.RoutesNotFound)

    const quota = this.createQuotaFromRoute(from, routes[0])
    if (!this.verifyTask(task)) return new SdkException("Task aborted", SdkExceptionCode.Aborted)

    return quota
  }

  public async prepareEthersTransaction(data: ExecutorCallData, signer: JsonRpcSigner): Promise<SdkException | ethers.TransactionRequest> {
    const feeData = await signer.provider.getFeeData().catch(error => {
      return new SdkException("Cannot get fee data: " + String(error?.message), SdkExceptionCode.TransactionPrepareError)
    })

    if (feeData instanceof SdkException) return feeData

    const transactionDetails: ethers.TransactionRequest = {
      data: data.callData,
      chainId: data.network.chainId,
      value: data.value?.toBigNumber().toFixed(0),
      to: data.to.toString(),
      ...feeData
    }

    const estimation = await signer.estimateGas(transactionDetails).catch(error => {
      return new SdkException("Cannot estimate transaction: " + String(error?.message), SdkExceptionCode.TransactionPrepareError)
    })

    return {
      ...transactionDetails,
      gasLimit: new BigNumber(String(estimation)).multipliedBy(data.gasLimitMultiplier ?? 1).toFixed(0)
    }
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
