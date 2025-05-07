import { Address, Amount, ethersProvider } from "@safeblock/blockchain-utils"
import { WrappedToken__factory } from "~/abis/types"
import { contractAddresses, publicBackendURL } from "~/config"
import { PriceStorageExtension } from "~/extensions"
import evmBuildRawTransaction from "~/sdk/evm-converter/evm-build-raw-transaction"
import EvmCrossChainExtension from "~/sdk/evm-converter/evm-cross-chain-extension"
import ExchangeConverter from "~/sdk/exchange-converter"
import { ExchangeUtils } from "~/sdk/exchange-utils"
import SdkCore, { SdkConfig } from "~/sdk/sdk-core"
import SdkException, { SdkExceptionCode } from "~/sdk/sdk-exception"
import { SdkMixins } from "~/sdk/sdk-mixins"
import simulateRoutes from "~/sdk/simulate-routes"
import { ExchangeQuota, ExchangeRequest, ExecutorCallData, SimulatedRoute } from "~/types"
import getExchangeRoutes from "~/utils/get-exchange-routes"

interface RawTransactionConverterOptions {
  from: Address
  taskId: symbol
  route: SimulatedRoute
  rawTransaction: Awaited<ReturnType<typeof evmBuildRawTransaction>>
  approveCallData?: string | undefined
  recalculateApproveData?: boolean
}

export default class EvmConverter extends ExchangeConverter {
  constructor(sdkInstance: SdkCore, private readonly sdkConfig: SdkConfig, private readonly mixins: SdkMixins) {
    super(sdkInstance)
  }

  public async rawTransactionToQuota(options: RawTransactionConverterOptions): Promise<ExchangeQuota> {
    const callData: ExecutorCallData[] = []
    let approveCallData: string | null = null

    if (options.approveCallData) approveCallData = options.approveCallData
    else if (options.recalculateApproveData && !Address.isZero(options.from)) {
      const {
        tokenContract: fromTokenContract,
        approveWanted,
        approveAmount
      } = await ExchangeUtils.getTokenTransferDetails(options.route.tokenIn, options.from, options.route.amountIn, this.sdkConfig)

      if (approveWanted) approveCallData = fromTokenContract.interface.encodeFunctionData("approve", [
        contractAddresses.entryPoint(options.route.tokenIn.network, this.sdkConfig),
        approveAmount.toBigInt()
      ])
    }

    if (approveCallData) {
      callData.push({
        callData: approveCallData,
        gasLimitMultiplier: 1,
        value: new Amount(0, 18, false),
        to: options.route.tokenIn.address,
        network: options.route.tokenIn.network
      })
    }

    const multiSwapCallData = options.rawTransaction
    callData.push({
      callData: multiSwapCallData.multiCallData,
      gasLimitMultiplier: 1.2,
      value: Address.isZero(options.route.tokenIn.address) ? options.route.amountIn : new Amount(0, 18, false),
      to: Address.from(contractAddresses.entryPoint(options.route.tokenIn.network, this.sdkConfig)),
      network: options.route.tokenIn.network
    })

    const rawQuota = {
      executorCallData: callData,
      exchangeRoute: [options.route.originalRouteSet],
      amountIn: options.route.amountIn,
      amountsOut: options.route.amountsOut,
      tokenIn: options.route.tokenIn,
      tokensOut: options.route.tokensOut,
      slippageReadable: options.route.slippageReadablePercent,
      priceImpact: options.route.priceImpactPercents,
      amountOutReadablePercentages: options.route.amountOutReadablePercentages
    }

    return {
      ...rawQuota,
      estimatedGasUsage: ExchangeUtils.computeQuotaExecutionGasUsage(rawQuota, this.mixins)
    }
  }

  public async createMultiChainTransaction(from: Address, request: ExchangeRequest, taskId: symbol): Promise<SdkException | ExchangeQuota> {
    const crossChain = new EvmCrossChainExtension(this, this.sdkConfig, this.mixins)

    return crossChain.createMultiChainExchangeTransaction(from, request, taskId)
  }

  public async createSingleChainTransaction(from: Address, route: SimulatedRoute, taskId: symbol): Promise<SdkException | ExchangeQuota> {
    const rawTransaction = await evmBuildRawTransaction(from, route, this.mixins)

    return this.mixins.getMixinApplicator("internal")
      .applyMixin("createSingleChainTransaction", "singleChainQuotaBuilt", await this.rawTransactionToQuota(
        {
          recalculateApproveData: true,
          rawTransaction,
          from,
          taskId,
          route
        }
      ))
  }

  public async fetchRoute(request: ExchangeRequest, taskId: symbol): Promise<SdkException | SimulatedRoute> {
    if (request.tokensOut.length > 1 && !request.exactInput)
      return new SdkException("Cannot process split swap request in the exact output mode", SdkExceptionCode.InvalidRequest)

    if (request.tokensOut.length !== request.amountOutReadablePercentages.length)
      return new SdkException("Invalid split swap configuration: tokensOut and amountOutPercentages length mismatch", SdkExceptionCode.InvalidRequest)

    const mixin = this.mixins.getMixinApplicator("internal")
      .getNamespaceApplicator("fetchRoute")

    this.sdkConfig.debugLogListener?.(`Fetch: Loading routes: ${ request.amountIn.toReadable() } ${ request.tokenIn.address
      .toString().slice(0, 10) } -> ${ request.amountsOut.map(a => a.toReadable()).join(",") } ${ request.tokensOut.map(t => t.address.toString().slice(2, 8)).join(",") }`)

    await this.sdkInstance.withExtension(PriceStorageExtension, async extension => await extension
      .waitInitialFetch(100))

    if (ExchangeUtils.isWrapUnwrap(request) && request.tokenIn.network === request.tokensOut[0].network && request.tokensOut.length === 1) {
      const { amountIn, amountsOut, tokenIn, tokensOut, destinationAddress, slippageReadablePercent } = request

      this.sdkConfig.debugLogListener?.("Fetch: Generated fake route for wrap/unwrap transaction")

      return mixin.applyMixin("wrapUnwrapVirtualRouteBuilt", {
        amountIn, amountsOut, tokenIn, tokensOut, destinationAddress, slippageReadablePercent,
        isExactInput: request.exactInput,
        priceImpactPercents: [0],
        arrivalGasAmount: undefined,
        routeReference: "wrap-unwrap",
        amountOutReadablePercentages: request.amountOutReadablePercentages,
        usedTokensList: [request.tokenIn, request.tokensOut[0]],
        originalRouteSet: [[{
          exchange_id: ExchangeUtils.ZeroExchangeId,
          fee: 0,
          version: "PAIR_WRAP_UNWRAP",
          address: request.tokenIn.address,
          token0: request.tokenIn,
          token1: request.tokensOut[0],
          fee_type: "none"
        }]]
      })
    }

    const alternativeRoute = await this.rerouteCrossChainRoutesFetch(request, Address.from(Address.zeroAddress), taskId)

    if (alternativeRoute !== null) return alternativeRoute

    const routes = await Promise.all(
      request.tokensOut.map(tokenOut => (
        getExchangeRoutes({
          backendUrl: this.sdkConfig.backend?.url ?? publicBackendURL,
          headers: this.sdkConfig.backend?.headers,
          bannedDexIds: this.sdkInstance.dexBlacklist.toArray(),
          limit: this.sdkConfig.routesCountLimit ?? 3,
          fromToken: request.tokenIn,
          toToken: tokenOut
        })
      ))
    )

    this.sdkConfig.debugLogListener?.(`Fetch: Received ${ routes.flat(1).length } (${ this.sdkConfig.routesCountHardLimit ?? 30 } limit) raw routes for single-chain trade`)

    if (!this.sdkInstance.verifyTask(taskId)) return new SdkException("Task aborted", SdkExceptionCode.Aborted)

    if (routes.length === 0) return new SdkException("Routes not found", SdkExceptionCode.RoutesNotFound)

    const simulatedRoute = this.mixins.getMixinApplicator("internal")
      .applyMixin("fetchRoute", "receivedFinalizedRoute", await simulateRoutes(
        request,
        routes.slice(0, this.sdkConfig.routesCountHardLimit ?? 30),
        this.sdkConfig,
        this.sdkInstance
      ))

    if (simulatedRoute instanceof SdkException) return simulatedRoute

    if (simulatedRoute.amountsOut.length !== simulatedRoute.tokensOut.length)
      return new SdkException("Routes simulation failed", SdkExceptionCode.SimulationFailed)

    this.sdkConfig.debugLogListener?.(`Fetch: Best route output amounts: ${ simulatedRoute.amountsOut.map(a => a.toReadable()).join(",") }`)

    if (!this.sdkInstance.verifyTask(taskId)) return new SdkException("Task aborted", SdkExceptionCode.Aborted)

    return simulatedRoute
  }

  public createSingleChainWrapUnwrapTransaction(request: ExchangeRequest): ExchangeQuota | SdkException {
    if (request.tokenIn.network !== request.tokensOut[0].network) return new SdkException("Different networks", SdkExceptionCode.InvalidRequest)
    if (request.tokensOut.length > 1)
      return new SdkException("Cannot process direct wrap/unwrap in split swap mode", SdkExceptionCode.InvalidRequest)

    if (!Address.isZero(request.tokenIn.address) && !Address.isZero(request.tokensOut[0].address))
      return new SdkException("Not wrap unwrap", SdkExceptionCode.InvalidRequest)

    const wrappedAddress = Address.from(Address.wrappedOf(request.tokenIn.network))

    if (!Address.isZero(request.tokenIn.address) && !Address.equal(request.tokenIn.address, wrappedAddress))
      return new SdkException("Not wrap unwrap", SdkExceptionCode.InvalidRequest)

    if (!Address.isZero(request.tokensOut[0].address) && !Address.equal(request.tokensOut[0].address, wrappedAddress))
      return new SdkException("Not wrap unwrap", SdkExceptionCode.InvalidRequest)

    const amount = request.exactInput
      ? Amount.select(request.amountIn, request.amountsOut[0])
      : Amount.select(request.amountsOut[0], request.amountIn)

    if (!amount || amount.eq(0)) return new SdkException("Invalid amount: expected greater than zero", SdkExceptionCode.InvalidRequest)

    const callData: ExecutorCallData[] = []

    const wrappedToken = WrappedToken__factory.connect(wrappedAddress.toString(), ethersProvider(request.tokenIn.network))

    if (Address.isZero(request.tokenIn.address)) {
      this.sdkConfig.debugLogListener?.("Generating wrap transaction")

      callData.push({
        callData: wrappedToken.interface.encodeFunctionData("deposit"),
        value: amount,
        gasLimitMultiplier: 1,
        to: wrappedAddress,
        network: request.tokenIn.network
      })
    }
    else {
      this.sdkConfig.debugLogListener?.("Generating unwrap transaction")

      callData.push({
        callData: wrappedToken.interface.encodeFunctionData("withdraw", [
          amount.toBigInt()
        ]),
        value: new Amount(0, 18, false),
        gasLimitMultiplier: 1,
        to: wrappedAddress,
        network: request.tokenIn.network
      })
    }

    const rawQuota = {
      executorCallData: callData,
      slippageReadable: 0,
      exchangeRoute: [],
      tokenIn: request.tokenIn,
      tokensOut: request.tokensOut,
      amountIn: amount,
      amountOutReadablePercentages: request.amountOutReadablePercentages,
      amountsOut: [amount],
      priceImpact: [0]
    }

    return this.mixins.getMixinApplicator("internal").applyMixin("createSingleChainWrapUnwrapTransaction", "quotaBuilt", {
      ...rawQuota,
      estimatedGasUsage: ExchangeUtils.computeQuotaExecutionGasUsage(rawQuota, this.mixins)
    })
  }
}
