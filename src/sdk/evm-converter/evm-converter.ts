import { Address, Amount, ethersProvider } from "@safeblock/blockchain-utils"
import { WrappedToken__factory } from "~/abis/types"
import { contractAddresses, publicBackendURL } from "~/config"
import evmBuildRawTransaction from "~/sdk/evm-converter/evm-build-raw-transaction"
import EvmCrossChainExtension from "~/sdk/evm-converter/evm-cross-chain-extension"
import ExchangeConverter from "~/sdk/exchange-converter"
import { ExchangeUtils } from "~/sdk/exchange-utils"
import simulateRoutes from "~/sdk/simulate-routes"
import { SdkInstance } from "~/sdk"
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

  public async createMultiChainTransaction(from: Address, request: ExchangeRequest, taskId: symbol): Promise<Error | ExchangeQuota> {
    const crossChain = new EvmCrossChainExtension(this)

    return crossChain.createMultiChainExchangeTransaction(from, request, taskId)
  }

  public async createSingleChainTransaction(from: Address, route: SimulatedRoute, taskId: symbol): Promise<Error | ExchangeQuota> {
    const rawTransaction = await evmBuildRawTransaction(from, route)

    return this.rawTransactionToQuota({
      recalculateApproveData: true,
      rawTransaction,
      from,
      taskId,
      route
    })
  }

  public async fetchRoutes(request: ExchangeRequest, taskId: symbol): Promise<Error | SimulatedRoute[]> {
    const alternativeRoute = await this.rerouteCrossChainRoutesFetch(request, Address.from(Address.zeroAddress), taskId)

    if (alternativeRoute !== null) return alternativeRoute

    const routes = await getExchangeRoutes({
      backendUrl: this.sdkInstance.sdkConfig.backend?.url ?? publicBackendURL,
      headers: this.sdkInstance.sdkConfig.backend?.headers,
      bannedDexIds: this.sdkInstance.dexBlacklist.toArray(),
      fromToken: request.tokenIn,
      toToken: request.tokenOut
    })

    if (!this.sdkInstance.verifyTask(taskId)) return Error("Task aborted")

    const simulatedRoutes = await simulateRoutes(request, this.sdkInstance.priceStorage, routes)

    if (!this.sdkInstance.verifyTask(taskId)) return Error("Task aborted")

    return simulatedRoutes.filter(route => ExchangeUtils
      .filterRoutesByExpectedOutput(route, this.sdkInstance.priceStorage, this.sdkInstance.sdkConfig.routePriceDifferenceLimit))
  }

  public createSingleChainWrapUnwrapTransaction(request: ExchangeRequest): ExchangeQuota | Error {
    if (request.tokenIn.network !== request.tokenOut.network) return Error("Different networks")

    if (!Address.isZero(request.tokenIn.address) && !Address.isZero(request.tokenOut.address))
      return Error("Not wrap unwrap")

    const wrappedAddress = Address.from(Address.wrappedOf(request.tokenIn.network))

    if (!Address.isZero(request.tokenIn.address) && !Address.equal(request.tokenIn.address, wrappedAddress))
      return Error("Not wrap unwrap")

    if (!Address.isZero(request.tokenOut.address) && !Address.equal(request.tokenOut.address, wrappedAddress))
      return Error("Not wrap unwrap")

    const amount = request.exactInput
      ? Amount.select(request.amountIn, request.amountOut)
      : Amount.select(request.amountOut, request.amountIn)

    if (!amount || amount.eq(0)) return Error("Invalid amount: expected greater than zero")

    const callData: ExecutorCallData[] = []

    const wrappedToken = WrappedToken__factory.connect(wrappedAddress.toString(), ethersProvider(request.tokenIn.network))

    if (Address.isZero(request.tokenIn.address)) {
      callData.push({
        callData: wrappedToken.interface.encodeFunctionData("deposit"),
        value: amount,
        gasLimitMultiplier: 1,
        to: wrappedAddress,
        network: request.tokenIn.network
      })
    }
    else {
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