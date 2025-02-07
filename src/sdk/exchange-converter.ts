import { Address, Amount } from "@safeblock/blockchain-utils"
import { ExchangeUtils } from "~/sdk/exchange-utils"
import { SdkInstance } from "~/sdk/index"
import { ExchangeQuota, ExchangeRequest, SimulatedRoute } from "~/types"
import PriceStorage from "~/utils/price-storage"
import SdkException from "~/utils/sdk-exception"

export default abstract class ExchangeConverter {
  protected constructor(public sdkInstance: SdkInstance) {}

  public abstract fetchRoutes(request: ExchangeRequest, taskId: symbol): Promise<SdkException | SimulatedRoute[]>

  public abstract createSingleChainTransaction(from: Address, route: SimulatedRoute, taskId: symbol): Promise<SdkException | ExchangeQuota>

  public abstract createMultiChainTransaction(from: Address, request: ExchangeRequest, taskId: symbol): Promise<SdkException | ExchangeQuota>

  public abstract createSingleChainWrapUnwrapTransaction(request: ExchangeRequest): ExchangeQuota | SdkException

  protected isCrossChain(request: ExchangeRequest): boolean {
    return request.tokenIn.network.name !== request.tokenOut.network.name
  }

  protected async rerouteCrossChainRoutesFetch(request: ExchangeRequest, zeroAddress: Address, taskId: symbol): Promise<SdkException | SimulatedRoute[] | null> {
    if (!this.isCrossChain(request)) return null

    const transaction = await this.createMultiChainTransaction(zeroAddress, request, taskId)

    if (transaction instanceof SdkException) return transaction

    return [
      this.createMockRoute(
        request,
        transaction.amountIn,
        transaction.amountOut,
        this.sdkInstance.priceStorage
      )
    ]
  }

  protected createMockRoute(request: ExchangeRequest, amountIn: Amount, amountOut: Amount, priceStorage: PriceStorage): SimulatedRoute {
    return {
      ...request,
      originalRoute: [{
        exchange_id: "MockBridgeId",
        address: Address.from(Address.zeroAddress),
        fee: 0,
        version: "V0",
        token0: {
          ...request.tokenIn,
          fee: 0,
        },
        token1: {
          ...request.tokenOut,
          fee: 0
        }
      }],
      amountIn,
      amountOut,
      routeReference: Math.random().toString(),
      isExactInput: request.exactInput,
      priceImpactPercent: ExchangeUtils.computePriceImpact(request, amountIn, amountOut, priceStorage),
      usedTokensList: [request.tokenIn, request.tokenOut]
    }
  }
}