import { Address, Amount, ton } from "@safeblock/blockchain-utils"
import { DEX, pTON } from "@ston-fi/sdk"
import { SenderArguments } from "@ton/ton"
import ExchangeConverter from "~/sdk/exchange-converter"
import stonfiRouteFetcher from "~/sdk/ton-converter/fetchers/stonfi-route-fetcher"
import TonCrossChainExtension from "~/sdk/ton-converter/ton-cross-chain-extension"
import { SdkInstance } from "~/sdk"
import { ExchangeQuota, ExchangeRequest, SimulatedRoute } from "~/types"


export default class TonConverter extends ExchangeConverter {
  private readonly routeFetchers: ((exchangeRequest: ExchangeRequest, taskId: symbol, sdkInstance: SdkInstance) => Promise<SimulatedRoute | Error>)[] = [
    stonfiRouteFetcher
  ]

  constructor(sdkInstance: SdkInstance) {
    super(sdkInstance)
  }

  public async fetchRoutes(exchangeRequest: ExchangeRequest, taskId: symbol): Promise<Error | SimulatedRoute[]> {
    const alternativeRoute = await this.rerouteCrossChainRoutesFetch(exchangeRequest, Address.from(Address.tonBounceableNativeAddress), taskId)

    if (alternativeRoute !== null) return alternativeRoute

    const fetcherResponses = await Promise.all(
      this.routeFetchers.map(fetcher => fetcher(exchangeRequest, taskId, this.sdkInstance))
    )

    return fetcherResponses.filter(result => !(result instanceof Error)) as SimulatedRoute[]
  }

  public async createSingleChainTransaction(from: Address, route: SimulatedRoute, taskId: symbol): Promise<Error | ExchangeQuota> {
    if (!this.sdkInstance.tonClient) return Error("Ton client not initialized")

    const stonfiRouter = this.sdkInstance.tonClient.open(new DEX.v1.Router())

    if (from.equalTo(Address.zeroAddress)) return Error("No wallet address")

    const basicTxParams = {
      userWalletAddress: from.toString(),
      offerAmount: route.amountIn.toString(),
      askJettonAddress: route.tokenOut.address.toString(),
      minAskAmount: (route.amountOut.toReadable() * ((100 - route.slippageReadablePercent) / 100)).toFixed(0),
      offerJettonAddress: route.tokenIn.address.toString(),
      proxyTon: new pTON.v1()
    }

    let txParams: SenderArguments

    // TON -> Jetton
    if (route.tokenIn.address.equalTo(Address.tonBounceableNativeAddress))
      txParams = await stonfiRouter.getSwapTonToJettonTxParams(basicTxParams)

    // Jetton -> TON
    else if (route.tokenOut.address.equalTo(Address.tonBounceableNativeAddress))
      txParams = await stonfiRouter.getSwapJettonToTonTxParams(basicTxParams)

    // Jetton -> Jetton
    else
      txParams = await stonfiRouter.getSwapJettonToJettonTxParams(basicTxParams)

    if (!txParams.body) return Error("Transaction not built")

    if (!this.sdkInstance.verifyTask(taskId)) return Error("Task aborted")

    return {
      amountIn: route.amountIn,
      amountOut: route.amountOut,
      tokenIn: route.tokenIn,
      tokenOut: route.tokenOut,
      slippageReadable: route.slippageReadablePercent,
      priceImpact: route.priceImpactPercent,
      executorCallData: [ {
        callData: txParams.body.toBoc().toString("base64"),
        to: Address.from(txParams.to.toString()),
        value: txParams.value ? Amount.from(txParams.value.toString(), 9, false) : undefined,
        network: ton
      } ]
    }
  }

  public async createMultiChainTransaction(from: Address, exchangeRequest: ExchangeRequest, taskId: symbol): Promise<Error | ExchangeQuota> {
    if (exchangeRequest.tokenOut.network.name === ton.name) return Error("Not supported yet")

    const symbiosisService = new TonCrossChainExtension(this)
    return symbiosisService.buildTonToEthereumTransaction(from, exchangeRequest.destinationAddress ?? Address.from(Address.evmBurnAddress), exchangeRequest, taskId)
  }

  public createSingleChainWrapUnwrapTransaction(): ExchangeQuota | Error {
    return Error("Not available on TON network")
  }
}