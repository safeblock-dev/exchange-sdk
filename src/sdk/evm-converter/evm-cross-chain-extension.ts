import { Address, Amount } from "@safeblock/blockchain-utils"
import BigNumber from "bignumber.js"
import { AbiCoder, toUtf8Bytes } from "ethers"
import { BridgeFaucet__factory, Entrypoint__factory, LayerZero__factory, TransferFaucet__factory } from "~/abis/types"
import { contractAddresses, stargateNetworksMapping } from "~/config"
import evmBuildRawTransaction from "~/sdk/evm-converter/evm-build-raw-transaction"
import EvmConverter from "~/sdk/evm-converter/evm-converter"
import { ExchangeUtils } from "~/sdk/exchange-utils"
import { ExchangeQuota, ExchangeRequest, ExecutorCallData, SimulatedRoute } from "~/types"
import { BasicToken } from "~/utils/tokens-list"

interface IBuildCrossChainTransactionOptions {
  sourceChainRoute: SimulatedRoute | null
  destinationChainRoute: SimulatedRoute | null
  toNetworkUSDT: Omit<BasicToken, "network">
  fromNetworkUSDT: Omit<BasicToken, "network">
  from: Address
  sourceNetworkSendAmount: Amount
}

export default class EvmCrossChainExtension {
  constructor(private readonly parent: EvmConverter) {}

  public async createMultiChainExchangeTransaction(from: Address, request: ExchangeRequest, taskId: symbol) {
    const _request = ExchangeUtils.autoUpdateDirection(request)

    if (_request instanceof Error) return _request

    if (_request.exactInput) return this.createMultiChainExchangeTransactionLTR(from, _request, taskId)

    return this.createMultiChainExchangeTransactionRTL(from, _request, taskId)
  }

  private async createMultiChainExchangeTransactionRTL(from: Address, request: ExchangeRequest, taskId: symbol) {
    const environment = await this.generateEnvironment(request)

    if (environment instanceof Error) return environment

    const {
      fromNetworkUSDT,
      toNetworkUSDT
    } = environment

    let destinationNetworkExpectedReceiveAmountUSDT: Amount = request.amountOut

    let sourceChainRoute: null | SimulatedRoute = null
    let destinationChainRoute: null | SimulatedRoute = null
    let sourceNetworkSendAmount: Amount = request.amountIn

    if (!Address.equal(request.tokenOut.address, toNetworkUSDT.address)) {
      const destinationChainRoutes = await this.parent.fetchRoutes(ExchangeUtils.updateRequest(request, {
        tokenIn: toNetworkUSDT
      }), taskId)


      if (destinationChainRoutes instanceof Error) return destinationChainRoutes
      if (destinationChainRoutes.length === 0) return Error("Destination routes not found")

      destinationNetworkExpectedReceiveAmountUSDT = destinationChainRoutes[0].amountIn
      destinationChainRoute = destinationChainRoutes[0]
    }

    if (!Address.equal(request.tokenIn.address, fromNetworkUSDT.address)) {
      const sourceChainRoutes = await this.parent.fetchRoutes(ExchangeUtils.updateRequest(request, {
        tokenOut: fromNetworkUSDT,
        amountOut: Amount.from(destinationNetworkExpectedReceiveAmountUSDT.toReadable(), fromNetworkUSDT.decimals, true)
      }), taskId)

      if (sourceChainRoutes instanceof Error) return sourceChainRoutes
      if (sourceChainRoutes.length === 0) return Error("Source routes not found")

      sourceNetworkSendAmount = sourceChainRoutes[0].amountOut

      sourceChainRoute = sourceChainRoutes[0]
    }
    else sourceNetworkSendAmount = Amount.from(destinationNetworkExpectedReceiveAmountUSDT.toReadable(), fromNetworkUSDT.decimals, true)

    return this.buildCrossChainTransaction(request, taskId, {
      sourceChainRoute,
      sourceNetworkSendAmount,
      destinationChainRoute,
      toNetworkUSDT,
      fromNetworkUSDT,
      from
    })
  }

  private async createMultiChainExchangeTransactionLTR(from: Address, request: ExchangeRequest, taskId: symbol) {
    const environment = await this.generateEnvironment(request)

    if (!this.parent.sdkInstance.verifyTask(taskId)) return Error("Aborted")

    if (environment instanceof Error) return environment

    const {
      fromNetworkUSDT,
      toNetworkUSDT
    } = environment

    let sourceNetworkSendAmount: Amount = request.amountIn

    let sourceChainRoute: null | SimulatedRoute = null
    let destinationChainRoute: null | SimulatedRoute = null

    if (!Address.equal(request.tokenIn.address, fromNetworkUSDT.address)) {
      const sourceChainRoutes = await this.parent.fetchRoutes(ExchangeUtils.updateRequest(request, {
        tokenOut: fromNetworkUSDT
      }), taskId)


      if (!this.parent.sdkInstance.verifyTask(taskId)) return Error("Aborted")

      if (sourceChainRoutes instanceof Error) return sourceChainRoutes

      if (sourceChainRoutes.length === 0) return Error("Source routes not found")


      sourceNetworkSendAmount = sourceChainRoutes[0].amountOut

      sourceChainRoute = sourceChainRoutes[0]
    }

    if (!Address.equal(request.tokenOut.address, toNetworkUSDT.address)) {
      const destinationChainRoutes = await this.parent.fetchRoutes(ExchangeUtils.updateRequest(request, {
        tokenIn: toNetworkUSDT,
        amountIn: Amount.from((sourceChainRoute?.amountOut ?? request.amountIn).toReadable(), toNetworkUSDT.decimals, true)
      }), taskId)

      if (!this.parent.sdkInstance.verifyTask(taskId)) return Error("Aborted")

      if (destinationChainRoutes instanceof Error) return destinationChainRoutes
      if (destinationChainRoutes.length === 0) return Error("Destination routes not found")

      destinationChainRoute = destinationChainRoutes[0]
    }

    return this.buildCrossChainTransaction(request, taskId, {
      sourceChainRoute,
      sourceNetworkSendAmount,
      destinationChainRoute,
      toNetworkUSDT,
      fromNetworkUSDT,
      from
    })
  }

  private async buildCrossChainTransaction(request: ExchangeRequest, taskId: symbol, options: IBuildCrossChainTransactionOptions) {
    const {
      sourceChainRoute,
      destinationChainRoute,
      toNetworkUSDT,
      fromNetworkUSDT,
      from,
      sourceNetworkSendAmount
    } = options

    const transferFaucetIface = TransferFaucet__factory.createInterface()
    const bridgeIface = BridgeFaucet__factory.createInterface()
    const entryPointIface = Entrypoint__factory.createInterface()
    let nativeAmount = new BigNumber(0)

    let destinationNetworkCallData: string | null = null
    const sourceNetworkCallData: string[] = []

    if (sourceChainRoute) {
      const sourceChainSwapData = await evmBuildRawTransaction(from, sourceChainRoute)
      const sourceChainSwap = await this.parent.rawTransactionToQuota({
        recalculateApproveData: true,
        rawTransaction: sourceChainSwapData,
        from,
        route: sourceChainRoute,
        taskId
      })

      if (!this.parent.sdkInstance.verifyTask(taskId)) return Error("Aborted")

      if (Address.isZero(request.tokenIn.address)) nativeAmount = nativeAmount.plus(sourceChainSwap.amountIn.toString())

      sourceNetworkCallData.push(sourceChainSwapData.multiSwapData)
    }
    else {
      if (Address.isZero(request.tokenIn.address)) nativeAmount = nativeAmount.plus(request.amountIn.toString())
    }

    if (destinationChainRoute) {
      const destinationChainSwapData = await evmBuildRawTransaction(from, destinationChainRoute)
      //const destinationChainSwap = await this.parent.rawTransactionToQuota({
      //  recalculateApproveData: true,
      //  rawTransaction: destinationChainSwapData,
      //  from,
      //  route: destinationChainRoute,
      //  taskId
      //})

      if (!this.parent.sdkInstance.verifyTask(taskId)) return Error("Aborted")

      const abiCoder = new AbiCoder()
      destinationNetworkCallData = abiCoder.encode(
        [ "address", "address", "bytes32", "bytes" ],
        [
          toNetworkUSDT.address.toString(),
          Address.from(request.destinationAddress || from || Address.zeroAddress).toString(),
          "0x00000000000000000000000000000000000000000000000000000000000000e8",
          destinationChainSwapData.multiCallData
        ]
      )
    }

    const bridgeQuota = await ExchangeUtils.computeBridgeQuota(
      request,
      from,
      sourceNetworkSendAmount.toString(),
      destinationNetworkCallData
    )

    if (!this.parent.sdkInstance.verifyTask(taskId)) return Error("Aborted")

    if (bridgeQuota instanceof Error) return bridgeQuota

    nativeAmount = nativeAmount.plus(bridgeQuota.valueToSend.toString())

    const arrivalGas = await ExchangeUtils.computeArrivalGasData(request, from)

    if (!this.parent.sdkInstance.verifyTask(taskId)) return Error("Aborted")

    if (arrivalGas instanceof Error) return arrivalGas

    if (arrivalGas) nativeAmount = nativeAmount.plus(arrivalGas.nativeAmount.toString())

    const transferData = transferFaucetIface.encodeFunctionData("transferToken", [
      Address.from(request.destinationAddress || from || Address.zeroAddress).toString()
    ])

    sourceNetworkCallData.push(
      bridgeIface.encodeFunctionData("sendStargateV2", [
        contractAddresses.stargateUSDTPool(request.tokenIn.network),
        stargateNetworksMapping(request.tokenOut.network),
        !Address.equal(request.tokenIn.address, fromNetworkUSDT.address) ? 0 : Amount.select(sourceChainRoute?.amountIn!, sourceNetworkSendAmount)!.toString(),
        destinationNetworkCallData ? contractAddresses.entryPoint(request.tokenOut.network) : (request.destinationAddress || from || Address.zeroAddress).toString(),
        destinationNetworkCallData ? 400_000 : 0,
        destinationNetworkCallData || toUtf8Bytes("")
      ])
    )

    sourceNetworkCallData.push(transferData)

    const callOffset = sourceNetworkCallData.length > 2
      ? "0x0000000000000000000000000000000000000000000000000000000000000044"
      : "0x0000000000000000000000000000000000000000000000000000000000000000"

    if (arrivalGas && arrivalGas.nativeAmount.gt(0)) {
      const lzIface = LayerZero__factory.createInterface()

      sourceNetworkCallData.push(
        lzIface.encodeFunctionData("sendDeposit", [
          stargateNetworksMapping(request.tokenOut.network),
          arrivalGas.nativeAmount.toBigInt(),
          Address.from(request.destinationAddress || from || Address.zeroAddress).toString()
        ])
      )
    }

    const executorCallData: ExecutorCallData[] = []

    const {
      tokenContract: fromTokenContract,
      approveWanted
    } = await ExchangeUtils.getTokenTransferDetails(request.tokenIn, from || Address.from(Address.zeroAddress), request.amountIn)

    if (!this.parent.sdkInstance.verifyTask(taskId)) return Error("Aborted")

    if (approveWanted) {
      executorCallData.push({
        callData: fromTokenContract.interface.encodeFunctionData("approve", [
          contractAddresses.entryPoint(request.tokenIn.network),
          request.amountIn.toBigInt()
        ]),
        gasLimitMultiplier: 1,
        value: new Amount(0, 18, false),
        to: request.tokenIn.address,
        network: request.tokenIn.network
      })
    }

    executorCallData.push({
      callData: entryPointIface.encodeFunctionData("multicall(bytes32,bytes[])", [
        callOffset,
        sourceNetworkCallData
      ]),
      gasLimitMultiplier: 1.2,
      value: new Amount(nativeAmount.toFixed(), 18, false),
      to: Address.from(contractAddresses.entryPoint(request.tokenIn.network)),
      network: request.tokenIn.network
    })

    if (!this.parent.sdkInstance.verifyTask(taskId)) return Error("Aborted")

    let amountOut = request.amountOut
    let amountIn = request.amountIn

    if (request.exactInput) {
      if (Address.equal(request.tokenOut.address, toNetworkUSDT.address)) {
        if (sourceChainRoute) amountOut = sourceChainRoute.amountOut
        else amountOut = sourceNetworkSendAmount
      }
      else {
        if (destinationChainRoute) amountOut = destinationChainRoute.amountOut
      }
    }
    else {
      if (Address.equal(request.tokenIn.address, fromNetworkUSDT.address)) {
        amountIn = sourceNetworkSendAmount
      }
      else {
        if (sourceChainRoute) amountIn = sourceChainRoute.amountIn
      }
    }

    const correctedAmountOut = Amount.from(amountOut.toReadable(), request.tokenOut.decimals, true)
    const correctedAmountIn = Amount.from(amountIn.toReadable(), request.tokenIn.decimals, true)

    return {
      executorCallData,
      amountOut: correctedAmountOut,
      amountIn: correctedAmountIn,
      tokenIn: request.tokenIn,
      tokenOut: request.tokenOut,
      slippageReadable: request.slippageReadablePercent,
      priceImpact: ExchangeUtils.computePriceImpact(request, correctedAmountIn, correctedAmountOut, this.parent.sdkInstance.priceStorage)
    } as ExchangeQuota
  }

  private async generateEnvironment(request: ExchangeRequest) {
    if (request.tokenIn.network === request.tokenOut.network) return Error("Same network")

    const fromNetworkUSDT = contractAddresses.usdtParams(request.tokenIn.network)
    const toNetworkUSDT = contractAddresses.usdtParams(request.tokenOut.network)

    if (!fromNetworkUSDT || !toNetworkUSDT) return Error("No USDT found on source or destination network")

    return {
      fromNetworkUSDT: { ...fromNetworkUSDT, address: Address.from(fromNetworkUSDT.address), network: request.tokenIn.network },
      toNetworkUSDT: { ...toNetworkUSDT, address: Address.from(toNetworkUSDT.address), network: request.tokenOut.network }
    }
  }
}