import { Address, Amount, ethersProvider } from "@safeblock/blockchain-utils"
import BigNumber from "bignumber.js"
import { toUtf8Bytes } from "ethers"
import { BridgeFaucet__factory, LayerZero__factory, Token__factory } from "~/abis/types"
import { contractAddresses, stargateNetworksMapping } from "~/config"
import PriceStorageExtension from "~/extensions/price-storage-extension"
import { SdkConfig } from "~/sdk"
import SdkException, { SdkExceptionCode } from "~/sdk/sdk-exception"
import { SdkMixins } from "~/sdk/sdk-mixins"
import { BasicToken, ExchangeQuota, ExchangeRequest, RouteStep, SingleOutputSimulatedRoute } from "~/types"

interface BasicRequest {
  tokenIn: BasicToken
  tokensOut: BasicToken[]
}

export class ExchangeUtils {
  public static ZeroExchangeId = "00000000-0000-0000-0000-000000000000"

  public static async computeArrivalGasData(request: ExchangeRequest, address: Address, config?: SdkConfig) {
    try {
      if (!request.arrivalGasAmount || request.arrivalGasAmount.toReadableBigNumber().lte(0)) return null

      config?.debugLogListener?.("ArrivalGas: Conditions met")

      const lzContract = LayerZero__factory.connect(contractAddresses.entryPoint(request.tokenIn.network, config), ethersProvider(request.tokenIn.network))

      const nativeCap = new BigNumber((await lzContract.getNativeSendCap(stargateNetworksMapping(request.tokensOut[0].network))).toString())

      config?.debugLogListener?.("ArrivalGas: Native cap: " + nativeCap.toFixed())

      const amount = nativeCap.lt(request.arrivalGasAmount.toString()) ? new Amount(nativeCap.toNumber(), 18, false) : request.arrivalGasAmount

      config?.debugLogListener?.("ArrivalGas: Amount updated: " + amount.toBigNumber().toFixed())

      const lzFee = await lzContract.estimateFee(stargateNetworksMapping(request.tokensOut[0].network), amount.toBigNumber().toFixed(), Address.zeroAddress)

      config?.debugLogListener?.("ArrivalGas: LzFee get: " + lzFee.toString())

      const callData = lzContract.interface.encodeFunctionData("sendDeposit", [
        stargateNetworksMapping(request.tokensOut[0].network),
        amount.toBigNumber().toFixed(0),
        (request.destinationAddress ?? address).toString()
      ])

      return {
        nativeAmount: new Amount(lzFee, 18, false),
        callData
      }
    }
    catch (e: any) {
      return new SdkException(e.toString(), SdkExceptionCode.InternalError)
    }
  }

  public static async computeBridgeQuota(request: ExchangeRequest, address: Address, amountLD: string, destinationRouteSteps: number, destinationChainCallData: string | null, config?: SdkConfig) {
    const bridgeContract = BridgeFaucet__factory.connect(contractAddresses.entryPoint(request.tokenIn.network, config), ethersProvider(request.tokenIn.network))

    try {
      return await bridgeContract.quoteV2(
        contractAddresses.stargateUSDCPool(request.tokenIn.network),
        stargateNetworksMapping(request.tokensOut[0].network),
        amountLD,
        (request.destinationAddress || address || Address.zeroAddress).toString(),
        destinationChainCallData || toUtf8Bytes(""),
        destinationChainCallData ? 450_000 + (150_000 * destinationRouteSteps) : 0
      )
    }
    catch (e: any) {
      return new SdkException(e.toString(), SdkExceptionCode.InternalError)
    }
  }

  public static async getTokenTransferDetails(token: BasicToken, ownerAddress: Address, spendAmount: Amount, config?: SdkConfig) {
    const tokenContract = Token__factory.connect(token.address.toString(), ethersProvider(token.network))

    let approveWanted: Amount = new Amount(0, token.decimals, false)
    if (!Address.isZero(token.address) && ownerAddress) {

      const allowance = new BigNumber((await tokenContract.allowance(ownerAddress.toString(), contractAddresses.entryPoint(token.network, config), {})).toString()).dp(0)

      if (allowance.lt(spendAmount.toString())) approveWanted = new Amount(spendAmount.toReadableBigNumber(), token.decimals, true)
    }

    return {
      tokenContract,
      approveWanted: approveWanted.toReadableBigNumber().gt(0),
      approveAmount: approveWanted
    }
  }

  public static isWrap(request: BasicRequest) {
    if (request.tokenIn.network.name !== request.tokensOut[0].network.name) return false
    if (request.tokensOut.length !== 1) return false

    return request.tokenIn.address.equalTo(Address.zeroAddress)
      && request.tokensOut[0].address.equalTo(Address.wrappedOf(request.tokenIn.network))
  }

  public static isUnwrap(request: BasicRequest) {
    if (request.tokenIn.network.name !== request.tokensOut[0].network.name) return false
    if (request.tokensOut.length !== 1) return false

    return request.tokenIn.address.equalTo(Address.wrappedOf(request.tokensOut[0].network))
      && request.tokensOut[0].address.equalTo(Address.zeroAddress)
  }

  public static isWrapUnwrap(request: BasicRequest) {
    return this.isWrap(request) || this.isUnwrap(request)
  }

  private static computeOnchainTradeGasUsage(routeSet: RouteStep[][], receiveNativeCount = 0, mixinBuilder: SdkMixins) {
    const mixin = mixinBuilder.getMixinApplicator("internal")
      .getNamespaceApplicator("computeOnchainTradeGasUsage")

    const uniswapV3StepGasUsage = mixin.applyMixin("uniswapV3StepGasUsage", 450_000)
    const uniswapV2StepGasUsage = mixin.applyMixin("uniswapV2StepGasUsage", 300_000)
    const receiveNativeGasUsage = mixin.applyMixin("receiveNativeGasUsage", 80_000)

    let routeGasUsage = new BigNumber(mixin.applyMixin("routeInitialGasUsage", 100_000))

    if (routeSet.length === 0) return routeGasUsage
    routeSet.forEach(route => {
      route.map(step => {
        routeGasUsage = routeGasUsage.plus(step.version === "uniswap_v3" ? uniswapV3StepGasUsage : uniswapV2StepGasUsage)
      })
    })

    if (receiveNativeCount > 0) routeGasUsage.plus(receiveNativeGasUsage * receiveNativeCount)

    return routeGasUsage
  }

  public static computeQuotaExecutionGasUsage(quota: Omit<ExchangeQuota, "estimatedGasUsage">, mixinBuilder: SdkMixins) {
    const mixin = mixinBuilder.getMixinApplicator("internal")
      .getNamespaceApplicator("computeQuotaExecutionGasUsage")

    if (ExchangeUtils.isWrapUnwrap(quota)) {
      return {
        [quota.tokenIn.network.name]: Amount.from(new BigNumber(ExchangeUtils.isWrap(quota)
          ? mixin.applyMixin("wrapTransactionGasUsage", 35_000)
          : mixin.applyMixin("unwrapTransactionGasUsage", 55_000)
        ), 18, true)
      }
    }

    const stargateSwapMessageGasUsage = mixin.applyMixin("stargateSwapMessageGasUsage", 450_000)
    const stargateHollowMessageGasUsage = mixin.applyMixin("stargateHollowMessageGasUsage", 300_000)

    const receiveNativeAmount = quota.tokensOut.filter(i => i.address.equalTo(Address.zeroAddress)).length
    if (quota.tokenIn.network.name === quota.tokensOut[0].network.name)
      return { [quota.tokenIn.network.name]: Amount.from(this.computeOnchainTradeGasUsage(quota.exchangeRoute[0] ?? [], receiveNativeAmount, mixinBuilder), 18, true) }

    const sourceChainExecutionGasUsage = this.computeOnchainTradeGasUsage(quota.exchangeRoute[0] ?? [], 0, mixinBuilder)
    const destinationChainExecutionGasUsage = this.computeOnchainTradeGasUsage(quota.exchangeRoute[1] ?? [], receiveNativeAmount, mixinBuilder)

    const stargateGasUsage = sourceChainExecutionGasUsage.eq(0) ? stargateHollowMessageGasUsage : stargateSwapMessageGasUsage

    return {
      [quota.tokenIn.network.name]: Amount.from(sourceChainExecutionGasUsage.plus(stargateGasUsage)
        .plus(quota.executorCallData.length > 0 ? mixin.applyMixin("multiStepExchangeWrapperGasUsage", 45_000) : 0)
        .multipliedBy(mixin.applyMixin("finalMultiplier", 1)), 18, true),
      [quota.tokensOut[0].network.name]: Amount.from(destinationChainExecutionGasUsage
        .multipliedBy(mixin.applyMixin("finalMultiplier", 1)), 18, true)
    }
  }

  public static computePriceImpact(request: ExchangeRequest, tokenOut: BasicToken, amountIn: Amount, amountOut: Amount, priceStorage: PriceStorageExtension) {
    const tokenInPrice = priceStorage.getPrice(request.tokenIn.network, request.tokenIn.address)
    const tokenOutPrice = priceStorage.getPrice(tokenOut.network, tokenOut.address)

    const tokenInAmountUSD = amountIn.toReadableBigNumber().multipliedBy(tokenInPrice.toReadableBigNumber())
    const tokenOutAmountUSD = amountOut.toReadableBigNumber().multipliedBy(tokenOutPrice.toReadableBigNumber())

    const priceImpact = tokenOutAmountUSD.div(tokenInAmountUSD).minus(1).multipliedBy(100)

    if (priceImpact.isNaN()) return 0

    if (priceImpact.gte(9_999)) return 9_999
    if (priceImpact.lte(-9_999)) return -9_999

    return priceImpact.toNumber()
  }

  public static updateRequest(request: ExchangeRequest, update: Partial<ExchangeRequest>) {
    return {
      ...request,
      ...update
    }
  }

  public static filterRoutesByExpectedOutput(route: SingleOutputSimulatedRoute, priceStorage: PriceStorageExtension, maxDifference = 15, config?: SdkConfig) {
    const fromTokenPrice = priceStorage.getPrice(route.tokenIn.network, route.tokenIn.address)
    if (fromTokenPrice.lte(0)) config?.debugLogListener?.(`Possible exception with ${ route.tokenIn.network.name } ${ route.tokenIn
      .address.toString().slice(0, 19) }: price lower than or equal to zero`)

    const toTokenPrice = priceStorage.getPrice(route.tokenOut.network, route.tokenOut.address)
    if (toTokenPrice.lte(0)) config?.debugLogListener?.(`Possible exception with ${ route.tokenOut.network.name } ${ route.tokenOut
      .address.toString().slice(0, 19) }: price lower than or equal to zero`)

    const fromTokenUSDAmount = route.amountIn.mul(fromTokenPrice).toReadableBigNumber()
    const toTokenUSDAmount = route.amountOut.mul(toTokenPrice).toReadableBigNumber()

    const change = toTokenUSDAmount.minus(fromTokenUSDAmount).div(fromTokenUSDAmount).multipliedBy(100)

    return change.abs().lt(maxDifference)
  }

  public static autoUpdateDirection(request: ExchangeRequest): SdkException | ExchangeRequest {
    const _request = { ...request }

    const outNetworksList = request.tokensOut.map(t => t.network.name)

    if (new Set(outNetworksList).size !== 1)
      return new SdkException("Cannot use more than one output network in split swap mode", SdkExceptionCode.InvalidRequest)

    if (
      (!Amount.isAmount(_request.amountIn) && _request.amountsOut.length > 1)
      || (!request.exactInput && _request.amountsOut.length > 1)
    ) return new SdkException("Cannot execute exactInput swaps in split swap mode", SdkExceptionCode.InvalidRequest)

    if (!Amount.isAmount(_request.amountIn) && !Amount.isAmount(_request.amountsOut[0]))
      return new SdkException("Invalid request", SdkExceptionCode.InvalidRequest)

    if (_request.exactInput && !Amount.isAmount(_request.amountIn) && _request.amountsOut.length <= 1) return ExchangeUtils.updateRequest(_request, {
      exactInput: false
    })

    if (!_request.exactInput && !Amount.isAmount(_request.amountsOut[0])) return ExchangeUtils.updateRequest(_request, {
      exactInput: true
    })

    return _request
  }
}
