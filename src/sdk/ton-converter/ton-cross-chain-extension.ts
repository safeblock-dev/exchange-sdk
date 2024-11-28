import { Address, Amount, ethersProvider, ton } from "@safeblock/blockchain-utils"
import { Token__factory } from "~/abis/types"
import { contractAddresses } from "~/config"
import EvmConverter from "~/sdk/evm-converter"
import ExchangeConverter from "~/sdk/exchange-converter"
import { ExchangeUtils } from "~/sdk/exchange-utils"
import { BackendResponse, ExchangeQuota, ExchangeRequest, ExecutorCallData } from "~/types"
import request from "~/utils/request"
import DirectRoute = BackendResponse.Symbiosis.DirectRoute

export default class TonCrossChainExtension {
  private readonly base = "https://api.symbiosis.finance/crosschain"
  private directRoutes: DirectRoute[] = []

  private static TON_USDT_ADDRESS = "0x9328Eb759596C38a25f59028B146Fecdc3621Dfe"

  constructor(private readonly tonConverter: ExchangeConverter) {}

  public async fetchDirectRoutes() {
    if (this.directRoutes.length) return

    const directRoutes = await request<BackendResponse.Symbiosis.DirectRoute[]>({
      base: this.base,
      path: "/v1/direct-routes"
    })

    if (!directRoutes) return

    this.directRoutes = directRoutes
      .filter(route => route.destinationChainId === 85918 || route.originChainId === 85918)
      .filter(route => Address.inArray(TonCrossChainExtension.TON_USDT_ADDRESS, [ route.destinationToken, route.originToken ]))
  }

  public async findDirectRoute(request: ExchangeRequest, taskId: symbol) {
    await this.fetchDirectRoutes()

    if (!this.tonConverter.sdkInstance.verifyTask(taskId)) return Error("Task aborted")

    if (request.tokenIn.network.name === request.tokenOut.network.name) return Error("Same network not allowed")

    if (request.tokenIn.network.name === ton.name) {
      const directRoute = this.directRoutes.find(route => (
        Address.equal(route.originToken, TonCrossChainExtension.TON_USDT_ADDRESS)
        && route.destinationChainId.toString() === request.tokenOut.network.chainId.toString()
        && Address.equal(route.destinationToken, request.tokenOut.address)
      ))

      if (directRoute) return directRoute

      // NOTE: 100% exists I think
      return this.directRoutes.find(route => (
        Address.equal(route.originToken, TonCrossChainExtension.TON_USDT_ADDRESS)
        && route.destinationChainId.toString() === request.tokenOut.network.chainId.toString()
      ))!
    }

    return this.directRoutes.find(route => (
      Address.equal(route.destinationToken, TonCrossChainExtension.TON_USDT_ADDRESS)
      && route.originChainId.toString() === request.tokenIn.network.chainId.toString()
    ))!
  }

  public async buildTonToEthereumTransaction(from: Address, to: Address, exchangeRequest: ExchangeRequest, taskId: symbol): Promise<Error | ExchangeQuota> {
    if (exchangeRequest.tokenIn.network.name !== ton.name) return Error("Invalid tokenIn network")
    if (!from.isTon() || !to.isEthereum()) return Error("Invalid addresses")

    const tonUSDT = contractAddresses.usdtParams(ton)

    let amountIn: Amount = exchangeRequest.amountIn
    const transactions: ExecutorCallData[] = []

    if (!exchangeRequest.tokenIn.address.equalTo(tonUSDT.address)) {
      const onChainExchangeRequest: ExchangeRequest = {
        exactInput: true,
        slippageReadablePercent: exchangeRequest.slippageReadablePercent,
        tokenIn: exchangeRequest.tokenIn,
        tokenOut: {
          ...tonUSDT,
          address: Address.from(tonUSDT.address),
          network: ton
        },
        amountIn: exchangeRequest.amountIn,
        amountOut: Amount.from(0, 18, false)
      }

      const routes = await this.tonConverter.fetchRoutes(onChainExchangeRequest, taskId)

      if (routes instanceof Error) return Error("No source network routes: " + routes.message)
      if (routes.length === 0) return Error("No source network routes")

      const onChainSwap = await this.tonConverter.createSingleChainTransaction(from, routes[0], taskId)

      if (onChainSwap instanceof Error) return onChainSwap

      amountIn = onChainSwap.amountOut
      transactions.push(...onChainSwap.executorCallData)
    }

    const directRoute = await this.findDirectRoute(exchangeRequest, taskId)
    if (directRoute instanceof Error) return directRoute

    const tokenContract = Token__factory.connect(directRoute.destinationToken, ethersProvider(exchangeRequest.tokenOut.network))
    const tokenDecimals = await tokenContract.decimals()

    const swapApiResponse = await request<BackendResponse.Symbiosis.API.SwapApiResponse>({
      base: this.base,
      path: "/v1/swap",
      method: "POST",
      body: {
        tokenAmountIn: {
          address: TonCrossChainExtension.TON_USDT_ADDRESS,
          amount: amountIn.toString(),
          chainId: 85918,
          decimals: 6
        },
        tokenOut: {
          chainId: parseInt(exchangeRequest.tokenOut.network.chainId.toString()),
          address: directRoute.destinationToken,
          symbol: "DEST_TOKEN",
          decimals: parseInt(tokenDecimals.toString())
        },
        from: from.toString(),
        to: to.toString(),
        slippage: 300
      }
    })

    if (!swapApiResponse || !swapApiResponse.tx.messages?.length) return Error("No swap api response")

    let amountOut = Amount.from(swapApiResponse.tokenAmountOutMin.amount.toString(), swapApiResponse.tokenAmountOutMin.decimals, false)

    transactions.push({
      callData: swapApiResponse?.tx.messages[0].payload,
      network: ton,
      value: Amount.from(swapApiResponse?.tx.messages[0].amount ?? "0", 9, false),
      to: Address.from(swapApiResponse?.tx.messages[0].address)
    })

    if (!exchangeRequest.tokenOut.address.equalTo(directRoute.destinationToken)) {
      const onChainExchangeRequest: ExchangeRequest = {
        tokenIn: {
          address: Address.from(directRoute.destinationToken),
          decimals: parseInt(tokenDecimals.toString()),
          network: exchangeRequest.tokenOut.network
        },
        tokenOut: exchangeRequest.tokenOut,
        amountIn: amountOut,
        amountOut: Amount.from(0, 18, false),
        exactInput: true,
        slippageReadablePercent: exchangeRequest.slippageReadablePercent
      }

      const evmConverter = new EvmConverter(this.tonConverter.sdkInstance)

      const routes = await evmConverter.fetchRoutes(onChainExchangeRequest, taskId)
      if (routes instanceof Error) return Error("No destination network routes: " + routes.message)
      if (routes.length === 0) return Error("No destination network routes")

      const onChainSwap = await evmConverter.createSingleChainTransaction(
        onChainExchangeRequest.destinationAddress ?? Address.from(Address.zeroAddress),
        routes[0],
        taskId
      )

      if (onChainSwap instanceof Error) return onChainSwap

      amountOut = onChainSwap.amountOut
      transactions.push(...onChainSwap.executorCallData)
    }

    return {
      executorCallData: transactions,
      amountOut,
      amountIn: exchangeRequest.amountIn,
      tokenOut: exchangeRequest.tokenOut,
      slippageReadable: exchangeRequest.slippageReadablePercent,
      tokenIn: exchangeRequest.tokenIn,
      priceImpact: ExchangeUtils.computePriceImpact(exchangeRequest, exchangeRequest.amountIn, amountOut, this.tonConverter.sdkInstance.priceStorage)
    }
  }


}
