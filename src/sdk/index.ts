import { Address, ethersProvider } from "@safeblock/blockchain-utils"
import BigNumber from "bignumber.js"
import { ethers, JsonRpcSigner, Network } from "ethers"
import EvmConverter from "~/sdk/evm-converter"
import { ExchangeUtils } from "~/sdk/exchange-utils"
import StateManager from "~/sdk/state-manager"
import { ExchangeQuota, ExchangeRequest, ExecutorCallData, RouteStep, SimulatedRoute } from "~/types"
import ArrayUtils from "~/utils/array-utils"
import PriceStorage from "~/utils/price-storage"
import SdkException, { SdkExceptionCode } from "~/utils/sdk-exception"
import TokensList, { BasicToken } from "~/utils/tokens-list"

export type SdkConfig = Partial<{
  tokensList: Record<string, BasicToken[]> | Map<string, BasicToken[]> | [string, BasicToken[]][]
  routePriceDifferenceLimit: number

  debugLogListener?: (...message: any[]) => void

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

    this.priceStorage.waitInitialFetch(100).then(() => {
      this.emitEvent("initialized", this)
      this.sdkConfig.debugLogListener?.("Price storage initialization finished")
    })
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

    this.sdkConfig.debugLogListener?.("DEX blacklists synced")
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

  private computeOnchainTradeGasUsage(route: RouteStep[], receiveNative = false) {
    const uniswapV3StepGasUsage = 450_000
    const uniswapV2StepGasUsage = 350_000
    const receiveNativeGasUsage = 75_000

    if (route.length === 0) return new BigNumber(0)

    let routeGasUsage = new BigNumber(75_000)
    route.forEach(step => {
      routeGasUsage = routeGasUsage.plus(step.version === "PAIR_VERSION_UNISWAP_V3" ? uniswapV3StepGasUsage : uniswapV2StepGasUsage)
    })

    if (receiveNative) routeGasUsage.plus(receiveNativeGasUsage)

    return routeGasUsage
  }

  private computeExchangeOnlyPrice(quota: ExchangeQuota, sourceGasPrice: BigNumber, destinationGasPrice: BigNumber) {
    if (ExchangeUtils.isWrapUnwrap(quota)) {
      return new BigNumber(ExchangeUtils.isWrap(quota) ? 35_000 : 55_000)
    }

    const stargateSwapMessageGasUsage = 600_000
    const stargateHollowMessageGasUsage = 450_000

    const _compute = (network: Network, route: RouteStep[], receiveNative: boolean, gasPrice: BigNumber) => {
      if (route.length === 0) return new BigNumber(0)

      const nativePrice = this.priceStorage.getPrice(network, Address.from(Address.wrappedOf(network)))

      // Gas usage
      const gasUsage = this.computeOnchainTradeGasUsage(route, receiveNative)

      // Execution price
      return gasPrice.multipliedBy(gasUsage).shiftedBy(-18).multipliedBy(nativePrice.toReadableBigNumber())
    }

    if (quota.tokenIn.network.name === quota.tokenOut.network.name)
      return _compute(quota.tokenIn.network, quota.exchangeRoute[0] ?? [], quota.tokenOut.address.equalTo(Address.zeroAddress), sourceGasPrice)

    const sourceChainExecutionPrice = _compute(quota.tokenIn.network, quota.exchangeRoute[0] ?? [], false, sourceGasPrice)
    const destinationChainExecutionPrice = _compute(quota.tokenOut.network, quota.exchangeRoute[1] ?? [], quota.tokenOut.address.equalTo(Address.zeroAddress), destinationGasPrice)

    const stargateGasUsage = sourceChainExecutionPrice.eq(0) ? stargateHollowMessageGasUsage : stargateSwapMessageGasUsage
    const stargateMessagePrice = sourceGasPrice.multipliedBy(stargateGasUsage)
      .shiftedBy(-18)
      .multipliedBy(this.priceStorage.getPrice(quota.tokenIn.network, Address.from(Address.wrappedOf(quota.tokenIn.network))).toReadableBigNumber())

    return sourceChainExecutionPrice.plus(destinationChainExecutionPrice).plus(stargateMessagePrice)
  }

  public async computeQuotaExecutionPrice(quota: ExchangeQuota) {
    const nativePrice = this.priceStorage.getPrice(quota.tokenIn.network, Address.from(Address.wrappedOf(quota.tokenIn.network))).toReadableBigNumber()

    const sourceChainProvider = ethersProvider(quota.tokenIn.network)
    const destinationChainProvider = quota.tokenIn.network.name === quota.tokenOut.network.name
      ? undefined
      : ethersProvider(quota.tokenOut.network)

    const [sourceChainFeeData, destinationChainFeeData] = await Promise.all([
      sourceChainProvider?.getFeeData(),
      destinationChainProvider?.getFeeData()
    ])

    const sourceChainGasPrice = new BigNumber(sourceChainFeeData?.gasPrice ? String(sourceChainFeeData.gasPrice) : 0)
    const destinationChainGasPrice = new BigNumber(destinationChainFeeData?.gasPrice ? String(destinationChainFeeData.gasPrice) : 0)

    let resultingPrice = this.computeExchangeOnlyPrice(quota, sourceChainGasPrice, destinationChainGasPrice)

    const nativeAmount = ArrayUtils
      .safeReduce(quota.executorCallData.map(c => c.value?.toReadableBigNumber() ?? new BigNumber(0)))

    if (quota.executorCallData.length > 1) resultingPrice = resultingPrice.plus(sourceChainGasPrice.multipliedBy(35_000).shiftedBy(-18).multipliedBy(nativePrice))

    return resultingPrice.plus(nativeAmount.multipliedBy(nativePrice)).multipliedBy(1.165)
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
      gasPrice: feeData.gasPrice
    }

    const estimation = await signer.estimateGas(transactionDetails).catch(error => {
      return new SdkException("Cannot estimate transaction: " + String(error?.message), SdkExceptionCode.TransactionPrepareError)
    })

    if (estimation instanceof SdkException) return estimation

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
