import { Address, Amount, ethersProvider } from "@safeblock/blockchain-utils"
import BigNumber from "bignumber.js"
import { toUtf8Bytes } from "ethers"
import {
  BridgeFaucet__factory,
  LayerZero__factory,
  Token__factory,
} from "~/abis/types"
import { contractAddresses, stargateNetworksMapping } from "~/config"
import { ExchangeRequest, SimulatedRoute } from "~/types"
import PriceStorage from "~/utils/price-storage"
import { BasicToken } from "~/utils/tokens-list"

export class ExchangeUtils {
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
      return Error(e.toString())
    }
  }

  public static async computeBridgeQuota(request: ExchangeRequest, address: Address, amountLD: string, destinationChainCallData: string | null) {
    const bridgeContract = BridgeFaucet__factory.connect(contractAddresses.entryPoint(request.tokenIn.network), ethersProvider(request.tokenIn.network))

    try {
      return await bridgeContract.quoteV2(
        contractAddresses.stargateUSDTPool(request.tokenIn.network),
        stargateNetworksMapping(request.tokenOut.network),
        amountLD,
        (request.destinationAddress || address || Address.zeroAddress).toString(),
        destinationChainCallData || toUtf8Bytes(""),
        destinationChainCallData ? 400_000 : 0
      )
    } catch (e: any) {
      return Error(e.toString())
    }
  }

  public static async getTokenTransferDetails(token: BasicToken, ownerAddress: Address, spendAmount: Amount) {
    //const tokenContract = getTokenContract(token.address, publicEthersProviders(token.network))
    const tokenContract = Token__factory.connect(token.address.toString(), ethersProvider(token.network))

    let approveWanted: Amount = new Amount(0, token.decimals, false)
    if (!Address.isZero(token.address) && ownerAddress) {

      const allowance = new BigNumber((await tokenContract.allowance(ownerAddress.toString(), contractAddresses.entryPoint(token.network), {})).toString())

      if (allowance.lt(spendAmount.toString())) approveWanted = new Amount(spendAmount.toInteger(), token.decimals, false)
    }

    return {
      tokenContract,
      approveWanted: approveWanted.toReadable() > 0,
      approveAmount: approveWanted
    }
  }

  public static isWrapUnwrap(request: ExchangeRequest | SimulatedRoute) {
    const addresses = [request.tokenIn.address, request.tokenOut.address]

    if (Address.inArray(Address.zeroAddress, addresses)) return false

    return addresses.some(address => Address.equal(address, Address.wrappedOf(request.tokenIn.network)))
      && addresses.some(address => Address.isZero(address))
  }

  public static computePriceImpact(request: ExchangeRequest, amountIn: Amount, amountOut: Amount, priceStorage: PriceStorage) {
    const tokenInPrice = priceStorage.getPrice(request.tokenIn)
    const tokenOutPrice = priceStorage.getPrice(request.tokenOut)

    const tokenInAmountUSD = amountIn.toReadable() * tokenInPrice.toReadable()
    const tokenOutAmountUSD = amountOut.toReadable() * tokenOutPrice.toReadable()

    const priceImpact = ((tokenOutAmountUSD / tokenInAmountUSD) - 1) * 100

    if (isNaN(priceImpact)) return 0

    if (priceImpact >= 9_999) return 9_999
    if (priceImpact <= -9_999) return -9_999

    return priceImpact
  }

  public static updateRequest(request: ExchangeRequest, update: Partial<ExchangeRequest>) {
    return {
      ...request,
      ...update
    }
  }

  public static async filterRoutesByExpectedOutput(route: SimulatedRoute, priceStorage: PriceStorage, maxDifference = 15) {
    const fromTokenPrice = priceStorage.getPrice(route.tokenIn)
    const toTokenPrice = priceStorage.getPrice(route.tokenOut)

    const fromTokenUSDAmount = route.amountIn.mul(fromTokenPrice).toReadable()
    const toTokenUSDAmount = route.amountOut.mul(toTokenPrice).toReadable()

    const change = ((toTokenUSDAmount - fromTokenUSDAmount) / fromTokenUSDAmount) * 100

    return Math.abs(change) < maxDifference
  }

  public static autoUpdateDirection(request: ExchangeRequest) {
    const _request = { ...request }

    if (!Amount.isAmount(_request.amountIn) && !Amount.isAmount(_request.amountOut))
      return Error("Invalid request")

    if (_request.exactInput && !Amount.isAmount(_request.amountIn)) return ExchangeUtils.updateRequest(_request, {
      exactInput: false
    })

    if (!_request.exactInput && !Amount.isAmount(_request.amountOut)) return ExchangeUtils.updateRequest(_request, {
      exactInput: true
    })

    return _request
  }
}

