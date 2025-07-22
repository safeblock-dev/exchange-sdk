import { Address, Amount } from "@safeblock/blockchain-utils"
import { PriceStorageExtension } from "~/extensions"
import { ExchangeUtils } from "~/sdk/exchange-utils"
import SdkCore from "~/sdk/sdk-core"
import SdkException from "~/sdk/sdk-exception"
import { ExchangeQuota, ExchangeRequest, SimulatedRoute } from "~/types"

export default abstract class ExchangeConverter {
  protected constructor(public sdkInstance: SdkCore) {}

  public abstract fetchRoute(request: ExchangeRequest, taskId: symbol, signal?: AbortSignal): Promise<SdkException | SimulatedRoute>

  public abstract createSingleChainTransaction(from: Address, request: ExchangeRequest, route: SimulatedRoute, taskId: symbol): Promise<SdkException | ExchangeQuota>

  public abstract createMultiChainTransaction(from: Address, request: ExchangeRequest, taskId: symbol): Promise<SdkException | ExchangeQuota>

  public abstract createSingleChainWrapUnwrapTransaction(request: ExchangeRequest): ExchangeQuota | SdkException

  protected isCrossChain(request: ExchangeRequest): boolean {
    return request.tokenIn.network.name !== request.tokensOut[0].network.name
  }

  protected async rerouteCrossChainRoutesFetch(request: ExchangeRequest, zeroAddress: Address, taskId: symbol): Promise<SdkException | SimulatedRoute | null> {
    if (!this.isCrossChain(request)) return null

    const transaction = await this.createMultiChainTransaction(zeroAddress, request, taskId)

    if (transaction instanceof SdkException) return transaction

    return this.createMockRoute(
      request,
      transaction.amountIn,
      transaction.amountsOut,
      this.sdkInstance.extension(PriceStorageExtension)
    )
  }

  protected createMockRoute(request: ExchangeRequest, amountIn: Amount, amountsOut: Amount[], priceStorage: PriceStorageExtension): SimulatedRoute {
    return {
      ...request,
      originalRouteSet: [[{
        exchange_id: "MockBridgeId",
        address: Address.zeroAddress,
        fee: 0,
        fee_type: "none",
        version: "V0",
        token0: request.tokenIn,
        token1: request.tokensOut[0]
      }]],
      amountIn,
      amountsOut,
      routeReference: Math.random().toString(),
      isExactInput: request.exactInput,
      priceImpactPercents: request.tokensOut.map((tokenOut, index) => (
        ExchangeUtils.computePriceImpact(request, tokenOut, amountIn, amountsOut[index], priceStorage)
      )),
      usedTokensList: [request.tokenIn, ...request.tokensOut]
    }
  }
}
