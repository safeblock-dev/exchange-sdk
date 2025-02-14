import { Address, Amount, ethersProvider } from "@safeblock/blockchain-utils"
import { WrappedToken__factory } from "~/abis/types"
import { contractAddresses, publicBackendURL } from "~/config"
import { SdkInstance } from "~/sdk"
import evmBuildRawTransaction from "~/sdk/evm-converter/evm-build-raw-transaction"
import EvmCrossChainExtension from "~/sdk/evm-converter/evm-cross-chain-extension"
import ExchangeConverter from "~/sdk/exchange-converter"
import { ExchangeUtils } from "~/sdk/exchange-utils"
import simulateRoutes from "~/sdk/simulate-routes"
import { ExchangeQuota, ExchangeRequest, ExecutorCallData, SimulatedRoute } from "~/types"
import getExchangeRoutes from "~/utils/get-exchange-routes"
import SdkException, { SdkExceptionCode } from "~/utils/sdk-exception"

interface RawTransactionConverterOptions {
  from: Address
  taskId: symbol
  route: SimulatedRoute
  rawTransaction: Awaited<ReturnType<typeof evmBuildRawTransaction>>
  approveCallData?: string | undefined
  recalculateApproveData?: boolean
}

export default class EvmConverter extends ExchangeConverter {
  constructor(sdkInstance: SdkInstance) {
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
      } = await ExchangeUtils.getTokenTransferDetails(options.route.tokenIn, options.from, options.route.amountIn)

      if (approveWanted) approveCallData = fromTokenContract.interface.encodeFunctionData("approve", [
        contractAddresses.entryPoint(options.route.tokenIn.network),
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
      to: Address.from(contractAddresses.entryPoint(options.route.tokenIn.network)),
      network: options.route.tokenIn.network
    })

    return {
      executorCallData: callData,
      amountIn: options.route.amountIn,
      amountOut: options.route.amountOut,
      tokenIn: options.route.tokenIn,
      tokenOut: options.route.tokenOut,
      slippageReadable: options.route.slippageReadablePercent,
      priceImpact: options.route.priceImpactPercent
    }
  }

  public async createMultiChainTransaction(from: Address, request: ExchangeRequest, taskId: symbol): Promise<SdkException | ExchangeQuota> {
    const crossChain = new EvmCrossChainExtension(this)

    return crossChain.createMultiChainExchangeTransaction(from, request, taskId)
  }

  public async createSingleChainTransaction(from: Address, route: SimulatedRoute, taskId: symbol): Promise<SdkException | ExchangeQuota> {
    const rawTransaction = await evmBuildRawTransaction(from, route)

    return this.rawTransactionToQuota({
      recalculateApproveData: true,
      rawTransaction,
      from,
      taskId,
      route
    })
  }

  public async fetchRoutes(request: ExchangeRequest, taskId: symbol): Promise<SdkException | SimulatedRoute[]> {
    this.sdkInstance.sdkConfig.debugLogListener?.(`Fetch: Loading routes: ${request.amountIn.toReadable()} ${request.tokenIn.address
      .toString().slice(0, 10)} -> ${request.amountOut.toReadable()} ${request.tokenOut.address.toString().slice(0, 10)}`)

    if (ExchangeUtils.isWrapUnwrap(request) && request.tokenIn.network === request.tokenOut.network) {
      const { amountIn, amountOut, tokenIn, tokenOut, destinationAddress, slippageReadablePercent } = request

      this.sdkInstance.sdkConfig.debugLogListener?.("Fetch: Generated fake route for wrap/unwrap transaction")

      return [{
        amountIn, amountOut, tokenIn, tokenOut, destinationAddress, slippageReadablePercent,
        isExactInput: request.exactInput,
        priceImpactPercent: 0,
        arrivalGasAmount: undefined,
        routeReference: "",
        usedTokensList: [ExchangeUtils.toRouteToken(request.tokenIn), ExchangeUtils.toRouteToken(request.tokenOut)],
        originalRoute: [{
          exchange_id: ExchangeUtils.ZeroExchangeId,
          fee: 0,
          version: "PAIR_WRAP_UNWRAP",
          address: request.tokenIn.address,
          token0: ExchangeUtils.toRouteToken(request.tokenIn),
          token1: ExchangeUtils.toRouteToken(request.tokenOut)
        }]
      }]
    }

    const alternativeRoute = await this.rerouteCrossChainRoutesFetch(request, Address.from(Address.zeroAddress), taskId)

    if (alternativeRoute !== null) return alternativeRoute

    const routes = await getExchangeRoutes({
      backendUrl: this.sdkInstance.sdkConfig.backend?.url ?? publicBackendURL,
      headers: this.sdkInstance.sdkConfig.backend?.headers,
      bannedDexIds: this.sdkInstance.dexBlacklist.toArray(),
      fromToken: request.tokenIn,
      toToken: request.tokenOut
    })

    this.sdkInstance.sdkConfig.debugLogListener?.(`Fetch: Received ${ routes.length } raw routes for single-chain trade`)

    if (!this.sdkInstance.verifyTask(taskId)) return new SdkException("Task aborted", SdkExceptionCode.Aborted)

    const simulatedRoutes = await simulateRoutes(request, this.sdkInstance.priceStorage, routes)

    this.sdkInstance.sdkConfig.debugLogListener?.(`Fetch: Raw routes simulation finished, ${ simulatedRoutes.length } routes left`)

    if (!this.sdkInstance.verifyTask(taskId)) return new SdkException("Task aborted", SdkExceptionCode.Aborted)

    const filteredRoutes = simulatedRoutes.filter(route => ExchangeUtils
      .filterRoutesByExpectedOutput(route, this.sdkInstance.priceStorage, this.sdkInstance.sdkConfig.routePriceDifferenceLimit))

    this.sdkInstance.sdkConfig.debugLogListener?.(`Fetch: Routes filtering finished, ${ filteredRoutes.length } routes left`)

    return filteredRoutes
  }

  public createSingleChainWrapUnwrapTransaction(request: ExchangeRequest): ExchangeQuota | SdkException {
    if (request.tokenIn.network !== request.tokenOut.network) return new SdkException("Different networks", SdkExceptionCode.InvalidRequest)

    if (!Address.isZero(request.tokenIn.address) && !Address.isZero(request.tokenOut.address))
      return new SdkException("Not wrap unwrap", SdkExceptionCode.InvalidRequest)

    const wrappedAddress = Address.from(Address.wrappedOf(request.tokenIn.network))

    if (!Address.isZero(request.tokenIn.address) && !Address.equal(request.tokenIn.address, wrappedAddress))
      return new SdkException("Not wrap unwrap", SdkExceptionCode.InvalidRequest)

    if (!Address.isZero(request.tokenOut.address) && !Address.equal(request.tokenOut.address, wrappedAddress))
      return new SdkException("Not wrap unwrap", SdkExceptionCode.InvalidRequest)

    const amount = request.exactInput
      ? Amount.select(request.amountIn, request.amountOut)
      : Amount.select(request.amountOut, request.amountIn)

    if (!amount || amount.eq(0)) return new SdkException("Invalid amount: expected greater than zero", SdkExceptionCode.InvalidRequest)

    const callData: ExecutorCallData[] = []

    const wrappedToken = WrappedToken__factory.connect(wrappedAddress.toString(), ethersProvider(request.tokenIn.network))

    if (Address.isZero(request.tokenIn.address)) {
      this.sdkInstance.sdkConfig.debugLogListener?.("Generating wrap transaction")

      callData.push({
        callData: wrappedToken.interface.encodeFunctionData("deposit"),
        value: amount,
        gasLimitMultiplier: 1,
        to: wrappedAddress,
        network: request.tokenIn.network
      })
    }
    else {
      this.sdkInstance.sdkConfig.debugLogListener?.("Generating unwrap transaction")

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

    return {
      executorCallData: callData,
      slippageReadable: 0,
      tokenIn: request.tokenIn,
      tokenOut: request.tokenOut,
      amountIn: amount,
      amountOut: amount,
      priceImpact: 0
    }
  }
}