import { Address, Amount, arrayUtils } from "@safeblock/blockchain-utils"
import BigNumber from "bignumber.js"
import { AbiCoder, toUtf8Bytes } from "ethers"
import { BridgeFaucet__factory, Entrypoint__factory, TransferFaucet__factory } from "~/abis/types"
import { contractAddresses, stargateNetworksMapping } from "~/config"
import { PriceStorageExtension } from "~/extensions"
import { SdkConfig } from "~/sdk"
import evmBuildRawTransaction from "~/sdk/evm-converter/evm-build-raw-transaction"
import EvmConverter from "~/sdk/evm-converter/evm-converter"
import { ExchangeUtils } from "~/sdk/exchange-utils"
import { SdkMixins } from "~/sdk/sdk-mixins"
import { ExchangeQuota, ExchangeRequest, ExecutorCallData, SimulatedRoute } from "~/types"
import SdkException, { SdkExceptionCode } from "~/sdk/sdk-exception"
import { BasicToken } from "~/types"

interface IBuildCrossChainTransactionOptions {
  sourceChainRoute: SimulatedRoute | null
  destinationChainRoute: SimulatedRoute | null
  toNetworkUSDC: Omit<BasicToken, "network">
  fromNetworkUSDC: Omit<BasicToken, "network">
  from: Address
  sourceNetworkSendAmount: Amount
}

export default class EvmCrossChainExtension {
  constructor(
    private readonly parent: EvmConverter,
    private readonly sdkConfig: SdkConfig,
    private readonly mixins: SdkMixins
  ) {}

  public async createMultiChainExchangeTransaction(from: Address, request: ExchangeRequest, taskId: symbol): Promise<ExchangeQuota | SdkException> {
    const _request = ExchangeUtils.autoUpdateDirection(request)

    if (_request instanceof SdkException) return _request

    if (_request.exactInput) return this.createMultiChainExchangeTransactionLTR(from, _request, taskId)

    return this.createMultiChainExchangeTransactionRTL(from, _request, taskId)
  }

  private async createMultiChainExchangeTransactionRTL(from: Address, request: ExchangeRequest, taskId: symbol): Promise<ExchangeQuota | SdkException> {
    const environment = await this.generateEnvironment(request)

    if (environment instanceof SdkException) return environment

    this.sdkConfig.debugLogListener?.("Preparing for cross-chain RTL trade computation")

    const {
      fromNetworkUSDC,
      toNetworkUSDC
    } = environment

    let destinationNetworkExpectedReceiveAmountUSDC: Amount = request.amountOut

    let sourceChainRoute: null | SimulatedRoute = null
    let destinationChainRoute: null | SimulatedRoute = null
    let sourceNetworkSendAmount: Amount = request.amountIn

    if (!Address.equal(request.tokenOut.address, toNetworkUSDC.address)) {
      this.sdkConfig.debugLogListener?.("RTL: computing destination chain routes")

      const destinationChainRoutes = await this.parent.fetchRoutes(ExchangeUtils.updateRequest(request, {
        tokenIn: toNetworkUSDC
      }), taskId)

      if (destinationChainRoutes instanceof SdkException) return destinationChainRoutes
      if (destinationChainRoutes.length === 0) return new SdkException("Destination routes not found", SdkExceptionCode.RoutesNotFound)

      destinationNetworkExpectedReceiveAmountUSDC = destinationChainRoutes[0].amountIn
      destinationChainRoute = destinationChainRoutes[0]

      this.sdkConfig.debugLogListener?.("RTL: at least one destination chain route found")
    }

    if (!Address.equal(request.tokenIn.address, fromNetworkUSDC.address)) {
      this.sdkConfig.debugLogListener?.("RTL: computing source chain routes")

      const sourceChainRoutes = await this.parent.fetchRoutes(ExchangeUtils.updateRequest(request, {
        tokenOut: fromNetworkUSDC,
        amountOut: Amount.from(destinationNetworkExpectedReceiveAmountUSDC.toReadable(), fromNetworkUSDC.decimals, true)
      }), taskId)


      if (sourceChainRoutes instanceof SdkException) return sourceChainRoutes
      if (sourceChainRoutes.length === 0) return new SdkException("Source routes not found", SdkExceptionCode.RoutesNotFound)

      sourceNetworkSendAmount = sourceChainRoutes[0].amountOut
      sourceChainRoute = sourceChainRoutes[0]

      this.sdkConfig.debugLogListener?.("RTL: at least one source chain route found")
    }
    else sourceNetworkSendAmount = Amount.from(destinationNetworkExpectedReceiveAmountUSDC.toReadable(), fromNetworkUSDC.decimals, true)

    return this.buildCrossChainTransaction(request, taskId, {
      sourceChainRoute,
      sourceNetworkSendAmount,
      destinationChainRoute,
      toNetworkUSDC: toNetworkUSDC,
      fromNetworkUSDC: fromNetworkUSDC,
      from
    })
  }

  private async createMultiChainExchangeTransactionLTR(from: Address, request: ExchangeRequest, taskId: symbol): Promise<ExchangeQuota | SdkException> {
    const environment = await this.generateEnvironment(request)

    if (!this.parent.sdkInstance.verifyTask(taskId)) return new SdkException("Task aborted", SdkExceptionCode.Aborted)

    if (environment instanceof SdkException) return environment

    const {
      fromNetworkUSDC,
      toNetworkUSDC
    } = environment

    let sourceNetworkSendAmount: Amount = request.amountIn

    let sourceChainRoute: null | SimulatedRoute = null
    let destinationChainRoute: null | SimulatedRoute = null

    if (!Address.equal(request.tokenIn.address, fromNetworkUSDC.address)) {
      this.sdkConfig.debugLogListener?.("LTR: computing source chain routes")

      const sourceChainRoutes = await this.parent.fetchRoutes(ExchangeUtils.updateRequest(request, {
        tokenOut: fromNetworkUSDC
      }), taskId)

      if (!this.parent.sdkInstance.verifyTask(taskId)) return new SdkException("Task aborted", SdkExceptionCode.Aborted)

      if (sourceChainRoutes instanceof SdkException) return sourceChainRoutes

      if (sourceChainRoutes.length === 0) return new SdkException("Source routes not found", SdkExceptionCode.RoutesNotFound)

      sourceNetworkSendAmount = sourceChainRoutes[0].amountOut
      sourceChainRoute = sourceChainRoutes[0]

      this.sdkConfig.debugLogListener?.("LTR: at least one source chain route found")
    }

    if (!Address.equal(request.tokenOut.address, toNetworkUSDC.address)) {
      this.sdkConfig.debugLogListener?.("LTR: computing destination chain routes")

      const destinationChainRoutes = await this.parent.fetchRoutes(ExchangeUtils.updateRequest(request, {
        tokenIn: toNetworkUSDC,
        amountIn: Amount.from((sourceChainRoute?.amountOut ?? request.amountIn).toReadable(), toNetworkUSDC.decimals, true)
      }), taskId)

      if (!this.parent.sdkInstance.verifyTask(taskId)) return new SdkException("Task aborted", SdkExceptionCode.Aborted)

      if (destinationChainRoutes instanceof SdkException) return destinationChainRoutes
      if (destinationChainRoutes.length === 0) return new SdkException("Destination routes not found", SdkExceptionCode.RoutesNotFound)

      destinationChainRoute = destinationChainRoutes[0]

      this.sdkConfig.debugLogListener?.("LTR: at least one destination chain route found")
    }

    return this.buildCrossChainTransaction(request, taskId, {
      sourceChainRoute,
      sourceNetworkSendAmount,
      destinationChainRoute,
      toNetworkUSDC: toNetworkUSDC,
      fromNetworkUSDC: fromNetworkUSDC,
      from
    })
  }

  private async buildCrossChainTransaction(request: ExchangeRequest, taskId: symbol, options: IBuildCrossChainTransactionOptions): Promise<ExchangeQuota | SdkException> {
    const {
      sourceChainRoute,
      destinationChainRoute,
      toNetworkUSDC,
      fromNetworkUSDC,
      from,
      sourceNetworkSendAmount
    } = options

    this.sdkConfig.debugLogListener?.("Build: Preparing for cross-chain transaction final build")

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

      if (!this.parent.sdkInstance.verifyTask(taskId)) return new SdkException("Task aborted", SdkExceptionCode.Aborted)

      if (Address.isZero(request.tokenIn.address)) nativeAmount = nativeAmount.plus(sourceChainSwap.amountIn.toString())

      sourceNetworkCallData.push(sourceChainSwapData.multiSwapData)
      this.sdkConfig.debugLogListener?.("Build: Source chain calldata added for execution")
    }
    else {
      if (Address.isZero(request.tokenIn.address)) nativeAmount = nativeAmount.plus(request.amountIn.toString())
    }

    if (destinationChainRoute) {
      const destinationChainSwapData = await evmBuildRawTransaction(from, destinationChainRoute)

      if (!this.parent.sdkInstance.verifyTask(taskId)) return new SdkException("Task aborted", SdkExceptionCode.Aborted)

      const abiCoder = new AbiCoder()
      destinationNetworkCallData = abiCoder.encode(
        ["address", "address", "bytes"],
        [
          toNetworkUSDC.address.toString(),
          Address.from(request.destinationAddress || from || Address.zeroAddress).toString(),
          destinationChainSwapData.multiCallData
        ]
      )

      this.sdkConfig.debugLogListener?.("Build: Destination chain calldata added for execution")
    }

    this.sdkConfig.debugLogListener?.("Build: Computing bridge quota")
    const bridgeQuota = await ExchangeUtils.computeBridgeQuota(
      request,
      from,
      sourceNetworkSendAmount.toString(),
      destinationNetworkCallData,
      this.sdkConfig
    )

    if (!this.parent.sdkInstance.verifyTask(taskId)) return new SdkException("Task aborted", SdkExceptionCode.Aborted)

    if (bridgeQuota instanceof SdkException) return bridgeQuota

    nativeAmount = nativeAmount.plus(bridgeQuota.valueToSend.toString())

    const arrivalGas = await ExchangeUtils.computeArrivalGasData(request, from, this.sdkConfig)

    if (!this.parent.sdkInstance.verifyTask(taskId)) return new SdkException("Task aborted", SdkExceptionCode.Aborted)

    if (arrivalGas instanceof SdkException) return arrivalGas

    const mixin = this.mixins.getMixinApplicator("internal")
      .getNamespaceApplicator("buildCrossChainTransaction")

    if (arrivalGas) nativeAmount = mixin.applyMixin("nativeAmountFinalized", nativeAmount.plus(arrivalGas.nativeAmount.toString()))

    const transferData = transferFaucetIface.encodeFunctionData("transferToken", [
      Address.from(request.destinationAddress || from || Address.zeroAddress).toString(),
      [
        sourceChainRoute?.tokenOut.address.toString() ?? fromNetworkUSDC.address.toString()
      ]
    ])

    sourceNetworkCallData.push(
      mixin.applyMixin("stargateSendV2CallData", (
        bridgeIface.encodeFunctionData("sendStargateV2", [
          contractAddresses.stargateUSDCPool(request.tokenIn.network),
          stargateNetworksMapping(request.tokenOut.network),
          !Address.equal(request.tokenIn.address, fromNetworkUSDC.address) ? 0 : Amount
            .select(sourceChainRoute?.amountIn!, sourceNetworkSendAmount)!.toString(),
          destinationNetworkCallData
            ? contractAddresses.entryPoint(request.tokenOut.network, this.sdkConfig)
            : (request.destinationAddress || from || Address.zeroAddress).toString(),
          destinationNetworkCallData ? 400_000 : 0,
          destinationNetworkCallData || toUtf8Bytes("")
        ])
      ))
    )

    sourceNetworkCallData.push(mixin.applyMixin("transferDataEncoded", transferData))

    if (arrivalGas && arrivalGas.nativeAmount.gt(0)) {
      this.sdkConfig.debugLogListener?.("Build: Computing arrival gas details and calldata")
      this.sdkConfig.debugLogListener?.("Build: Arrival gas native amount: " + arrivalGas.nativeAmount.toBigNumber().toFixed())

      sourceNetworkCallData.push(mixin.applyMixin("arrivalGasDataEncoded", arrivalGas.callData))
    }

    const executorCallData: ExecutorCallData[] = []

    const {
      tokenContract: fromTokenContract,
      approveWanted
    } = await ExchangeUtils.getTokenTransferDetails(
      request.tokenIn,
      from || Address.from(Address.zeroAddress),
      request.amountIn,
      this.sdkConfig
    )

    if (!this.parent.sdkInstance.verifyTask(taskId)) return new SdkException("Task aborted", SdkExceptionCode.Aborted)

    this.sdkConfig.debugLogListener?.(`Build: Approve verification: ${ approveWanted ? "wanted" : "approved" }`)
    if (approveWanted) {
      executorCallData.push(mixin.applyMixin("approveTransactionRequest", {
        callData: fromTokenContract.interface.encodeFunctionData("approve", [
          contractAddresses.entryPoint(request.tokenIn.network, this.sdkConfig),
          request.amountIn.toBigInt()
        ]),
        gasLimitMultiplier: 1,
        value: new Amount(0, 18, false),
        to: request.tokenIn.address,
        network: request.tokenIn.network
      }))
    }

    executorCallData.push(mixin.applyMixin("multiCallTransactionRequest", {
      callData: entryPointIface.encodeFunctionData("multicall", [
        sourceNetworkCallData
      ]),
      gasLimitMultiplier: 1.2,
      value: new Amount(nativeAmount.toFixed(), 18, false),
      to: Address.from(contractAddresses.entryPoint(request.tokenIn.network, this.sdkConfig)),
      network: request.tokenIn.network
    }))

    if (!this.parent.sdkInstance.verifyTask(taskId)) return new SdkException("Task aborted", SdkExceptionCode.Aborted)

    let amountOut = request.amountOut
    let amountIn = request.amountIn

    if (request.exactInput) {
      if (Address.equal(request.tokenOut.address, toNetworkUSDC.address)) {
        if (sourceChainRoute) amountOut = sourceChainRoute.amountOut
        else amountOut = sourceNetworkSendAmount
      }
      else {
        if (destinationChainRoute) amountOut = destinationChainRoute.amountOut
      }
    }
    else {
      if (Address.equal(request.tokenIn.address, fromNetworkUSDC.address)) {
        amountIn = sourceNetworkSendAmount
      }
      else {
        if (sourceChainRoute) amountIn = sourceChainRoute.amountIn
      }
    }

    const [correctedAmountIn, correctedAmountOut] = mixin.applyMixin("outputAmountsCorrected", [
      Amount.from(amountIn.toReadable(), request.tokenIn.decimals, true),
      Amount.from(amountOut.toReadable(), request.tokenOut.decimals, true)
    ])

    this.sdkConfig.debugLogListener?.("Build: Corrected response amounts")
    this.sdkConfig.debugLogListener?.(`Build: amountIn -> from ${ request.amountIn.toReadable() } to ${ correctedAmountIn.toReadable() }`)
    this.sdkConfig.debugLogListener?.(`Build: amountOut -> from ${ request.amountOut.toReadable() } to ${ correctedAmountOut.toReadable() }`)

    const rawQuota: Omit<ExchangeQuota, "estimatedGasUsage"> = {
      executorCallData,
      exchangeRoute: arrayUtils.nonNullable([sourceChainRoute?.originalRoute, destinationChainRoute?.originalRoute]),
      amountOut: correctedAmountOut,
      amountIn: correctedAmountIn,
      tokenIn: request.tokenIn,
      tokenOut: request.tokenOut,
      slippageReadable: request.slippageReadablePercent,
      priceImpact: ExchangeUtils
        .computePriceImpact(request, correctedAmountIn, correctedAmountOut, this.parent.sdkInstance.extension(PriceStorageExtension))
    }

    return mixin.applyMixin("quotaComputationFinalized", {
      ...rawQuota,
      estimatedGasUsage: ExchangeUtils.computeQuotaExecutionGasUsage(rawQuota, this.mixins)
    })
  }

  private async generateEnvironment(request: ExchangeRequest) {
    if (request.tokenIn.network === request.tokenOut.network) return new SdkException("Same network", SdkExceptionCode.SameNetwork)

    const fromNetworkUSDC = contractAddresses.usdcParams(request.tokenIn.network)
    const toNetworkUSDC = contractAddresses.usdcParams(request.tokenOut.network)

    if (!fromNetworkUSDC || !toNetworkUSDC) return new SdkException("No USDC found on source or destination network", SdkExceptionCode.NoTetherFound)

    return {
      fromNetworkUSDC: { ...fromNetworkUSDC, address: Address.from(fromNetworkUSDC.address), network: request.tokenIn.network },
      toNetworkUSDC: { ...toNetworkUSDC, address: Address.from(toNetworkUSDC.address), network: request.tokenOut.network }
    }
  }
}
