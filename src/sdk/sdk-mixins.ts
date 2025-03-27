import { Amount } from "@safeblock/blockchain-utils"
import BigNumber from "bignumber.js"
import { ExchangeQuota, ExecutorCallData, RouteStep, SimulatedRoute } from "~/types"

export interface NativeSDKMixinsList {
  internal: {
    buildCrossChainTransaction: {
      nativeAmountFinalized: BigNumber
      transferDataEncoded: string
      arrivalGasDataEncoded: string
      multiCallTransactionRequest: ExecutorCallData
      approveTransactionRequest: ExecutorCallData
      outputAmountsCorrected: [Amount, Amount]
      quotaComputationFinalized: ExchangeQuota
      stargateSendV2CallData: string
      callOffset: string
    },
    computeQuotaExecutionGasUsage: {
      stargateSwapMessageGasUsage: number
      stargateHollowMessageGasUsage: number
      wrapTransactionGasUsage: number
      unwrapTransactionGasUsage: number
      multiStepExchangeWrapperGasUsage: number
      finalMultiplier: number
    },
    computeOnchainTradeGasUsage: {
      uniswapV3StepGasUsage: number
      uniswapV2StepGasUsage: number
      receiveNativeGasUsage: number
      routeInitialGasUsage: number
    },
    fetchRoutes: {
      receivedExchangeRoutes: RouteStep[][]
      routesSimulationFinished: SimulatedRoute[]
      routesFilteringFinished: SimulatedRoute[]
      wrapUnwrapVirtualRouteBuilt: SimulatedRoute
    },
    createSingleChainTransaction: {
      singleChainQuotaBuilt: ExchangeQuota
    },
    createSingleChainWrapUnwrapTransaction: {
      quotaBuilt: ExchangeQuota
    }
  }
}

type MixinStorage<
  L extends keyof NativeSDKMixinsList,
  N extends keyof NativeSDKMixinsList[L],
  E extends keyof NativeSDKMixinsList[L][N]
> = {
  location: L
  namespace: N
  breakpoint: E
  callback: (value: NativeSDKMixinsList[L][N][E]) => NativeSDKMixinsList[L][N][E]
  identifier: string
}

export class SdkMixins {
  private mixins: MixinStorage<any, any, any>[] = []

  public addMixin<
    Location extends keyof NativeSDKMixinsList,
    Namespace extends keyof NativeSDKMixinsList[Location],
    Breakpoint extends keyof NativeSDKMixinsList[Location][Namespace],
    Value extends NativeSDKMixinsList[Location][Namespace][Breakpoint]
  >(location: Location, namespace: Namespace, breakpoint: Breakpoint, callback: (value: Value) => Value) {
    const identifier = (Math.random() * 1e8).toFixed(16)

    this.mixins.push({
      location,
      namespace: namespace as any,
      breakpoint: breakpoint as any,
      callback: callback as any,
      identifier
    })

    return identifier
  }

  public allocateMixinApplicator<Location extends keyof NativeSDKMixinsList>(location: Location) {
    const self = this

    const _applyMixin = <
      Namespace extends keyof NativeSDKMixinsList[Location],
      Breakpoint extends keyof NativeSDKMixinsList[Location][Namespace]
    >(
      namespace: Namespace,
      breakpoint: Breakpoint,
      value: NativeSDKMixinsList[Location][Namespace][Breakpoint]
    ): NativeSDKMixinsList[Location][Namespace][Breakpoint] => {
      try {
        let _value = JSON.parse(JSON.stringify(value))

        self.mixins.forEach(mixin => {
          if (mixin.location !== location || mixin.namespace !== namespace || mixin.breakpoint !== breakpoint) return

          _value = mixin.callback(_value as any)
        })

        return _value
      }
      catch {
        return value
      }
    }

    return {
      applyMixin: _applyMixin,

      getNamespaceApplicator: <Namespace extends keyof NativeSDKMixinsList[Location]>(namespace: Namespace) => ({
        applyMixin: <
          Breakpoint extends keyof NativeSDKMixinsList[Location][Namespace]
        >(breakpoint: Breakpoint, value: NativeSDKMixinsList[Location][Namespace][Breakpoint]) =>
          _applyMixin(namespace, breakpoint, value)
      })
    }
  }

  public removeMixin(identifier: string) {
    this.mixins = this.mixins.filter(mixin => mixin.identifier !== identifier)
  }
}
