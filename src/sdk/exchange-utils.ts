import { Address, Amount, ethersProvider } from "@safeblock/blockchain-utils"
import BigNumber from "bignumber.js"
import { toUtf8Bytes } from "ethers"
import { BridgeFaucet__factory, LayerZero__factory, Token__factory } from "~/abis/types"
import { contractAddresses, stargateNetworksMapping } from "~/config"
import { ExchangeRequest, SimulatedRoute } from "~/types"
import PriceStorage from "~/utils/price-storage"
import SdkException, { SdkExceptionCode } from "~/utils/sdk-exception"
import { BasicToken } from "~/utils/tokens-list"

export class ExchangeUtils {
  public static ZeroExchangeId = "00000000-0000-0000-0000-000000000000"

  public static toRouteToken(token: BasicToken): BasicToken & { fee: number } {
    return { fee: 0, ...token }
  }

  public static async computeArrivalGasData(request: ExchangeRequest, address: Address) {
    try {
      if (!request.arrivalGasAmount) return null

      const lzContract = LayerZero__factory.connect(contractAddresses.entryPoint(request.tokenIn.network), ethersProvider(request.tokenIn.network))

      const nativeCap = new BigNumber((await lzContract.getNativeSendCap(stargateNetworksMapping(request.tokenOut.network))).toString())

      const amount = nativeCap.lt(request.arrivalGasAmount.toString()) ? new Amount(nativeCap.toNumber(), 18, false) : request.arrivalGasAmount

      const lzFee = await lzContract.estimateFee(stargateNetworksMapping(request.tokenOut.network), amount.toBigInt(), Address.zeroAddress)

      const callData = lzContract.interface.encodeFunctionData("sendDeposit", [
        stargateNetworksMapping(request.tokenOut.network),
        amount.toBigInt(),
        (request.destinationAddress ?? address).toString()
      ])

      return {
        nativeAmount: new Amount(lzFee, 18, false),
        callData
      }
    } catch (e: any) {
      return new SdkException(e.toString(), SdkExceptionCode.InternalError)
    }
  }

  public static async computeBridgeQuota(request: ExchangeRequest, address: Address, amountLD: string, destinationChainCallData: string | null) {
    const bridgeContract = BridgeFaucet__factory.connect(contractAddresses.entryPoint(request.tokenIn.network), ethersProvider(request.tokenIn.network))

    try {
      return await bridgeContract.quoteV2(
        contractAddresses.stargateUSDCPool(request.tokenIn.network),
        stargateNetworksMapping(request.tokenOut.network),
        amountLD,
        (request.destinationAddress || address || Address.zeroAddress).toString(),
        destinationChainCallData || toUtf8Bytes(""),
        destinationChainCallData ? 400_000 : 0
      )
    } catch (e: any) {
      return new SdkException(e.toString(), SdkExceptionCode.InternalError)
    }
  }

  public static async getTokenTransferDetails(token: BasicToken, ownerAddress: Address, spendAmount: Amount) {
    const tokenContract = Token__factory.connect(token.address.toString(), ethersProvider(token.network))

    let approveWanted: Amount = new Amount(0, token.decimals, false)
    if (!Address.isZero(token.address) && ownerAddress) {

      const allowance = new BigNumber((await tokenContract.allowance(ownerAddress.toString(), contractAddresses.entryPoint(token.network), {})).toString())

      if (allowance.lt(spendAmount.toString())) approveWanted = new Amount(spendAmount.toInteger(), token.decimals, false)
    }

    return {
      tokenContract,
      approveWanted: approveWanted.toReadableBigNumber().gt(0),
      approveAmount: approveWanted
    }
  }

  public static isWrapUnwrap(request: ExchangeRequest | SimulatedRoute) {
    const addresses = [request.tokenIn.address, request.tokenOut.address]

    return addresses.some(address => Address.equal(address, Address.wrappedOf(request.tokenIn.network)))
      && addresses.some(address => Address.isZero(address))
  }

  public static computePriceImpact(request: ExchangeRequest, amountIn: Amount, amountOut: Amount, priceStorage: PriceStorage) {
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

  public static filterRoutesByExpectedOutput(route: SimulatedRoute, priceStorage: PriceStorage, maxDifference = 15) {
    const fromTokenPrice = priceStorage.getPrice(route.tokenIn.network, route.tokenIn.address)
    const toTokenPrice = priceStorage.getPrice(route.tokenOut.network, route.tokenOut.address)

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

