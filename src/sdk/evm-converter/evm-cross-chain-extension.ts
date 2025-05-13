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

    let destinationNetworkExpectedReceiveAmountUSDC: Amount = request.amountsOut[0]

    let sourceChainRoute: null | SimulatedRoute = null
    let destinationChainRoute: null | SimulatedRoute = null
    let sourceNetworkSendAmount: Amount = request.amountIn

    if (!Address.equal(request.tokensOut[0].address, toNetworkUSDC.address) || request.tokensOut.length > 1) {
      this.sdkConfig.debugLogListener?.("RTL: Computing destination chain routes")

      const destinationChainRoutes = await this.parent.fetchRoute(ExchangeUtils.updateRequest(request, {
        tokenIn: toNetworkUSDC
      }), taskId)

      if (destinationChainRoutes instanceof SdkException) return destinationChainRoutes

      destinationNetworkExpectedReceiveAmountUSDC = destinationChainRoutes.amountIn
      destinationChainRoute = destinationChainRoutes

      this.sdkConfig.debugLogListener?.("RTL: At least one destination chain route found")
    }

    if (!Address.equal(request.tokenIn.address, fromNetworkUSDC.address)) {
      this.sdkConfig.debugLogListener?.("RTL: Computing source chain routes")

      const sourceChainRoutes = await this.parent.fetchRoute(ExchangeUtils.updateRequest(request, {
        tokensOut: [fromNetworkUSDC],
        amountsOut: [Amount.from(destinationNetworkExpectedReceiveAmountUSDC, fromNetworkUSDC.decimals, true)],
        amountOutReadablePercentages: [100]
      }), taskId)


      if (sourceChainRoutes instanceof SdkException) return sourceChainRoutes

      sourceNetworkSendAmount = sourceChainRoutes.amountsOut[0]
      sourceChainRoute = sourceChainRoutes

      this.sdkConfig.debugLogListener?.("RTL: At least one source chain route found")
    }
    else sourceNetworkSendAmount = Amount.from(destinationNetworkExpectedReceiveAmountUSDC, fromNetworkUSDC.decimals, true)

    if (!destinationChainRoute && sourceNetworkSendAmount) sourceNetworkSendAmount = Amount
      .from(sourceNetworkSendAmount.toReadableBigNumber().multipliedBy(1.0003).toFixed(), sourceNetworkSendAmount.decimalPlaces, true)

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
      this.sdkConfig.debugLogListener?.("LTR: Computing source chain routes")

      const sourceChainRoutes = await this.parent.fetchRoute(ExchangeUtils.updateRequest(request, {
        tokensOut: [fromNetworkUSDC],
        amountOutReadablePercentages: [100],
      }), taskId)

      if (!this.parent.sdkInstance.verifyTask(taskId)) return new SdkException("Task aborted", SdkExceptionCode.Aborted)

      if (sourceChainRoutes instanceof SdkException) return sourceChainRoutes

      sourceNetworkSendAmount = sourceChainRoutes.amountsOut[0]
      sourceChainRoute = sourceChainRoutes

      this.sdkConfig.debugLogListener?.("LTR: At least one source chain route found")
    }

    if (!Address.equal(request.tokensOut[0].address, toNetworkUSDC.address) || request.tokensOut.length > 1) {
      this.sdkConfig.debugLogListener?.("LTR: Computing destination chain routes")

      const destinationChainRoutes = await this.parent.fetchRoute(ExchangeUtils.updateRequest(request, {
        tokenIn: toNetworkUSDC,
        amountIn: Amount.from(sourceChainRoute?.amountsOut[0] ?? request.amountIn, toNetworkUSDC.decimals, true)
      }), taskId)

      if (!this.parent.sdkInstance.verifyTask(taskId)) return new SdkException("Task aborted", SdkExceptionCode.Aborted)

      if (destinationChainRoutes instanceof SdkException) return destinationChainRoutes

      destinationChainRoute = destinationChainRoutes

      this.sdkConfig.debugLogListener?.("LTR: At least one destination chain route found")
    }

    if (!destinationChainRoute && sourceNetworkSendAmount) sourceNetworkSendAmount = Amount
      .from(sourceNetworkSendAmount.toReadableBigNumber().multipliedBy(0.9997).toFixed(), sourceNetworkSendAmount.decimalPlaces, true)

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
      const sourceChainSwapData = await evmBuildRawTransaction(from, sourceChainRoute, this.mixins)
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
      const destinationChainSwapData = await evmBuildRawTransaction(from, destinationChainRoute, this.mixins)

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
      sourceNetworkSendAmount.toBigNumber().toFixed(0),
      destinationChainRoute?.originalRouteSet.flat(1).length ?? 0,
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

    if (arrivalGas) nativeAmount = mixin.applyMixin("nativeAmountFinalized", nativeAmount.plus(arrivalGas.nativeAmount.toBigNumber()))

    const transferData = await mixin.applyMixin("tokenTransferCallDataFinalized", transferFaucetIface.encodeFunctionData("transferToken", [
      Address.from(request.destinationAddress || from || Address.zeroAddress).toString(),
      sourceChainRoute ? sourceChainRoute.tokensOut.map(t => t.address.toString()) : [fromNetworkUSDC.address.toString()]
    ]))

    sourceNetworkCallData.push(
      mixin.applyMixin("stargateSendV2CallData", (
        bridgeIface.encodeFunctionData("sendStargateV2", [
          contractAddresses.stargateUSDCPool(request.tokenIn.network),
          stargateNetworksMapping(request.tokensOut[0].network),
          !Address.equal(request.tokenIn.address, fromNetworkUSDC.address) ? 0 : Amount
            .select(sourceChainRoute?.amountIn!, sourceNetworkSendAmount)!.toString(),
          destinationNetworkCallData
            ? contractAddresses.entryPoint(request.tokensOut[0].network, this.sdkConfig)
            : (request.destinationAddress || from || Address.zeroAddress).toString(),
          destinationNetworkCallData ? (450_000 + (150_000 * (destinationChainRoute?.originalRouteSet.flat(1).length ?? 0))) : 0,
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
      approveWanted,
      resetRequired
    } = await ExchangeUtils.getTokenTransferDetails(
      request.tokenIn,
      from || Address.from(Address.zeroAddress),
      request.amountIn,
      this.sdkConfig
    )

    if (!this.parent.sdkInstance.verifyTask(taskId)) return new SdkException("Task aborted", SdkExceptionCode.Aborted)

    const basicTransactionDetails = {
      gasLimitMultiplier: 1,
      value: new Amount(0, 18, false),
      to: request.tokenIn.address,
      network: request.tokenIn.network
    }

    this.sdkConfig.debugLogListener?.(`Build: Approve reset requested: ${ resetRequired ? "yes" : "no" }`)
    if (resetRequired && approveWanted) {
      executorCallData.push(mixin.applyMixin("resetApproveTransactionRequest", {
        callData: fromTokenContract.interface.encodeFunctionData("approve", [
          contractAddresses.entryPoint(request.tokenIn.network, this.sdkConfig), 0
        ]),
        ...basicTransactionDetails
      }))
    }

    this.sdkConfig.debugLogListener?.(`Build: Approve verification: ${ approveWanted ? "wanted" : "approved" }`)
    if (approveWanted) {
      executorCallData.push(mixin.applyMixin("approveTransactionRequest", {
        callData: fromTokenContract.interface.encodeFunctionData("approve", [
          contractAddresses.entryPoint(request.tokenIn.network, this.sdkConfig),
          request.amountIn.toBigInt()
        ]),
        ...basicTransactionDetails
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

    let amountsOut = request.amountsOut
    let amountIn = request.amountIn

    if (request.exactInput) {
      if (Address.equal(request.tokensOut[0].address, toNetworkUSDC.address) && request.tokensOut.length === 1) {
        if (sourceChainRoute) amountsOut = sourceChainRoute.amountsOut
        else amountsOut = [sourceNetworkSendAmount]
      }
      else {
        if (destinationChainRoute) amountsOut = destinationChainRoute.amountsOut
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

    const [correctedAmountIn, correctedAmountsOut] = mixin.applyMixin("outputAmountsCorrected", [
      Amount.from(amountIn.toReadable(), request.tokenIn.decimals, true),
      amountsOut.map((amount, index) => Amount
        .from(amount.toReadable(), request.tokensOut[index].decimals, true))
    ])

    this.sdkConfig.debugLogListener?.("Build: Corrected response amounts")
    this.sdkConfig.debugLogListener?.(`Build: amountIn -> from ${ request.amountIn.toReadable() } to ${ correctedAmountIn.toReadable() }`)
    this.sdkConfig.debugLogListener?.(`Build: amountOut -> from ${ request.amountsOut.map(a => a.toReadable()).join(",") } to ${ correctedAmountsOut.map(a => a.toReadable()).join(",") }`)

    const rawQuota: Omit<ExchangeQuota, "estimatedGasUsage"> = {
      executorCallData,
      exchangeRoute: arrayUtils.nonNullable([sourceChainRoute?.originalRouteSet, destinationChainRoute?.originalRouteSet]),
      amountsOut: correctedAmountsOut,
      amountOutReadablePercentages: request.amountOutReadablePercentages,
      amountIn: correctedAmountIn,
      tokenIn: request.tokenIn,
      tokensOut: request.tokensOut,
      slippageReadable: request.slippageReadablePercent,
      priceImpact: request.tokensOut.map((tokenOut, index) => (
        ExchangeUtils
          .computePriceImpact(request, tokenOut, correctedAmountIn.mul(request.amountOutReadablePercentages[index] / 100), correctedAmountsOut[index], this.parent.sdkInstance.extension(PriceStorageExtension))
      ))
    }

    return mixin.applyMixin("quotaComputationFinalized", {
      ...rawQuota,
      estimatedGasUsage: ExchangeUtils.computeQuotaExecutionGasUsage(rawQuota, this.mixins)
    })
  }

  private async generateEnvironment(request: ExchangeRequest) {
    if (request.tokenIn.network === request.tokensOut[0].network) return new SdkException("Same network", SdkExceptionCode.SameNetwork)

    const netList = request.tokensOut.map(r => r.network.name)
    if (new Set(netList).size !== 1)
      return new SdkException("Cannot use more than one output network in split swap mode", SdkExceptionCode.InvalidRequest)

    const fromNetworkUSDC = contractAddresses.usdcParams(request.tokenIn.network)
    const toNetworkUSDC = contractAddresses.usdcParams(request.tokensOut[0].network)

    if (!fromNetworkUSDC || !toNetworkUSDC) return new SdkException("No USDC found on source or destination network", SdkExceptionCode.NoBaseTokenFound)

    return {
      fromNetworkUSDC: { ...fromNetworkUSDC, address: Address.from(fromNetworkUSDC.address), network: request.tokenIn.network },
      toNetworkUSDC: { ...toNetworkUSDC, address: Address.from(toNetworkUSDC.address), network: request.tokensOut[0].network }
    }
  }
}
