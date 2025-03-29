import { Address, Amount, ethersProvider } from "@safeblock/blockchain-utils"
import BigNumber from "bignumber.js"
import { toUtf8Bytes } from "ethers"
import { BridgeFaucet__factory, LayerZero__factory, Token__factory } from "~/abis/types"
import { contractAddresses, stargateNetworksMapping } from "~/config"
import PriceStorageExtension from "~/extensions/price-storage-extension"
import { SdkConfig } from "~/sdk"
import { SdkMixins } from "~/sdk/sdk-mixins"
import { ExchangeQuota, ExchangeRequest, RouteStep, SimulatedRoute } from "~/types"
import SdkException, { SdkExceptionCode } from "~/sdk/sdk-exception"
import { BasicToken } from "~/types"

interface BasicRequest {
  tokenIn: BasicToken
  tokenOut: BasicToken
}

export class ExchangeUtils {
  public static ZeroExchangeId = "00000000-0000-0000-0000-000000000000"

  public static toRouteToken(token: BasicToken): BasicToken & { fee: number } {
    return { fee: 0, ...token }
  }

  public static async computeArrivalGasData(request: ExchangeRequest, address: Address, config?: SdkConfig) {
    try {
      if (!request.arrivalGasAmount || request.arrivalGasAmount.toReadableBigNumber().lte(0)) return null

      config?.debugLogListener?.("ArrivalGas: Conditions met")

      const lzContract = LayerZero__factory.connect(contractAddresses.entryPoint(request.tokenIn.network, config), ethersProvider(request.tokenIn.network))

      const nativeCap = new BigNumber((await lzContract.getNativeSendCap(stargateNetworksMapping(request.tokenOut.network))).toString())

      config?.debugLogListener?.("ArrivalGas: Native cap: " + nativeCap.toFixed())

      const amount = nativeCap.lt(request.arrivalGasAmount.toString()) ? new Amount(nativeCap.toNumber(), 18, false) : request.arrivalGasAmount

      config?.debugLogListener?.("ArrivalGas: Amount updated: " + amount.toBigNumber().toFixed())

      const lzFee = await lzContract.estimateFee(stargateNetworksMapping(request.tokenOut.network), amount.toBigNumber().toFixed(), Address.zeroAddress)

      config?.debugLogListener?.("ArrivalGas: LzFee get: " + lzFee.toString())

      const callData = lzContract.interface.encodeFunctionData("sendDeposit", [
        stargateNetworksMapping(request.tokenOut.network),
        amount.toBigInt(),
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

  public static async computeBridgeQuota(request: ExchangeRequest, address: Address, amountLD: string, destinationChainCallData: string | null, config?: SdkConfig) {
    const bridgeContract = BridgeFaucet__factory.connect(contractAddresses.entryPoint(request.tokenIn.network, config), ethersProvider(request.tokenIn.network))

    try {
      return await bridgeContract.quoteV2(
        contractAddresses.stargateUSDCPool(request.tokenIn.network),
        stargateNetworksMapping(request.tokenOut.network),
        amountLD,
        (request.destinationAddress || address || Address.zeroAddress).toString(),
        destinationChainCallData || toUtf8Bytes(""),
        destinationChainCallData ? 400_000 : 0
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

      const allowance = new BigNumber((await tokenContract.allowance(ownerAddress.toString(), contractAddresses.entryPoint(token.network, config), {})).toString())

      if (allowance.lt(spendAmount.toString())) approveWanted = new Amount(spendAmount.toReadableBigNumber(), token.decimals, true)
    }

    return {
      tokenContract,
      approveWanted: approveWanted.toReadableBigNumber().gt(0),
      approveAmount: approveWanted
    }
  }

  public static isWrap(request: BasicRequest) {
    if (request.tokenIn.network.name !== request.tokenOut.network.name) return false

    return request.tokenIn.address.equalTo(Address.zeroAddress)
      && request.tokenOut.address.equalTo(Address.wrappedOf(request.tokenIn.network))
  }

  public static isUnwrap(request: BasicRequest) {
    if (request.tokenIn.network.name !== request.tokenOut.network.name) return false

    return request.tokenIn.address.equalTo(Address.wrappedOf(request.tokenOut.network))
      && request.tokenOut.address.equalTo(Address.zeroAddress)
  }

  public static isWrapUnwrap(request: BasicRequest) {
    return this.isWrap(request) || this.isUnwrap(request)
  }

  private static computeOnchainTradeGasUsage(route: RouteStep[], receiveNative = false, mixinBuilder: SdkMixins) {
    const mixin = mixinBuilder.getMixinApplicator("internal")
      .getNamespaceApplicator("computeOnchainTradeGasUsage")

    const uniswapV3StepGasUsage = mixin.applyMixin("uniswapV3StepGasUsage", 460_000)
    const uniswapV2StepGasUsage = mixin.applyMixin("uniswapV2StepGasUsage", 360_000)
    const receiveNativeGasUsage = mixin.applyMixin("receiveNativeGasUsage", 80_000)

    let routeGasUsage = new BigNumber(mixin.applyMixin("routeInitialGasUsage", 80_000))

    if (route.length === 0) return routeGasUsage
    route.forEach(step => {
      routeGasUsage = routeGasUsage.plus(step.version === "PAIR_VERSION_UNISWAP_V3" ? uniswapV3StepGasUsage : uniswapV2StepGasUsage)
    })

    if (receiveNative) routeGasUsage.plus(receiveNativeGasUsage)

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

    const stargateSwapMessageGasUsage = mixin.applyMixin("stargateSwapMessageGasUsage", 660_000)
    const stargateHollowMessageGasUsage = mixin.applyMixin("stargateHollowMessageGasUsage", 500_000)

    if (quota.tokenIn.network.name === quota.tokenOut.network.name)
      return { [quota.tokenIn.network.name]: Amount.from(this.computeOnchainTradeGasUsage(quota.exchangeRoute[0] ?? [], quota.tokenOut.address.equalTo(Address.zeroAddress), mixinBuilder), 18, true) }

    const sourceChainExecutionGasUsage = this.computeOnchainTradeGasUsage(quota.exchangeRoute[0] ?? [], false, mixinBuilder)
    const destinationChainExecutionGasUsage = this.computeOnchainTradeGasUsage(quota.exchangeRoute[1] ?? [], quota.tokenOut.address.equalTo(Address.zeroAddress), mixinBuilder)

    const stargateGasUsage = sourceChainExecutionGasUsage.eq(0) ? stargateHollowMessageGasUsage : stargateSwapMessageGasUsage

    return {
      [quota.tokenIn.network.name]: Amount.from(sourceChainExecutionGasUsage.plus(stargateGasUsage)
        .plus(quota.executorCallData.length > 0 ? mixin.applyMixin("multiStepExchangeWrapperGasUsage", 45_000) : 0)
        .multipliedBy(mixin.applyMixin("finalMultiplier", 1.15)), 18, true),
      [quota.tokenOut.network.name]: Amount.from(destinationChainExecutionGasUsage
        .multipliedBy(mixin.applyMixin("finalMultiplier", 1.15)), 18, true)
    }
  }

  public static computePriceImpact(request: ExchangeRequest, amountIn: Amount, amountOut: Amount, priceStorage: PriceStorageExtension) {
    const tokenInPrice = priceStorage.getPrice(request.tokenIn.network, request.tokenIn.address)
    const tokenOutPrice = priceStorage.getPrice(request.tokenOut.network, request.tokenOut.address)

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

  public static filterRoutesByExpectedOutput(route: SimulatedRoute, priceStorage: PriceStorageExtension, maxDifference = 15, config?: SdkConfig) {
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

    if (!Amount.isAmount(_request.amountIn) && !Amount.isAmount(_request.amountOut))
      return new SdkException("Invalid request", SdkExceptionCode.InvalidRequest)

    if (_request.exactInput && !Amount.isAmount(_request.amountIn)) return ExchangeUtils.updateRequest(_request, {
      exactInput: false
    })

    if (!_request.exactInput && !Amount.isAmount(_request.amountOut)) return ExchangeUtils.updateRequest(_request, {
      exactInput: true
    })

    return _request
  }
}
