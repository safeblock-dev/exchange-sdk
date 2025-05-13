import { Address, Amount } from "@safeblock/blockchain-utils"
import BigNumber from "bignumber.js"
import SdkException from "~/sdk/sdk-exception"
import { ExchangeQuota, ExecutorCallData, SimulatedRoute } from "~/types"

type TMixinList = { [key: string]: { [key: string]: { [key: string]: any } } }

/** Mixins description */
export interface InternalMixinList extends TMixinList {
  internal: {
    buildCrossChainTransaction: {
      nativeAmountFinalized: BigNumber
      transferDataEncoded: string
      arrivalGasDataEncoded: string
      multiCallTransactionRequest: ExecutorCallData
      approveTransactionRequest: ExecutorCallData
      resetApproveTransactionRequest: ExecutorCallData
      outputAmountsCorrected: [Amount, Amount[]]
      quotaComputationFinalized: ExchangeQuota,
      tokenTransferCallDataFinalized: Promise<string> | string
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
    fetchRoute: {
      receivedFinalizedRoute: SimulatedRoute | SdkException
      wrapUnwrapVirtualRouteBuilt: SimulatedRoute
    },
    createSingleChainTransaction: {
      singleChainQuotaBuilt: ExchangeQuota
      tokenTransferCallDataFinalized: Promise<string> | string
    },
    createSingleChainWrapUnwrapTransaction: {
      quotaBuilt: ExchangeQuota
    }
  }
}

type MixinStorage<
  L extends keyof InternalMixinList,
  N extends keyof InternalMixinList[L],
  E extends keyof InternalMixinList[L][N]
> = {
  location: L
  namespace: N
  breakpoint: E
  callback: (value: InternalMixinList[L][N][E]) => InternalMixinList[L][N][E]
  identifier: string
}
/**
 * SDK sub‑system that implements mixins
 */
export class SdkMixins<
  ExtensionMixins extends TMixinList = TMixinList,
  CombinedMixinsList extends TMixinList = ExtensionMixins & InternalMixinList
> {
  private mixins: MixinStorage<any, any, any>[] = []

  /**
   * Register a mixin that alters specific logic
   *
   * @param location   global namespace the mixin belongs to
   * @param namespace  local namespace the mixin belongs to
   * @param breakpoint mixin name (logical breakpoint)
   * @param callback   function that mutates the value
   * @returns {string} identifier of the registered mixin
   */
  public addMixin<
    Location extends keyof CombinedMixinsList,
    Namespace extends keyof CombinedMixinsList[Location],
    Breakpoint extends keyof CombinedMixinsList[Location][Namespace],
    Value extends CombinedMixinsList[Location][Namespace][Breakpoint]
  >(
    location: Location,
    namespace: Namespace,
    breakpoint: Breakpoint,
    callback: (value: Value) => Value
  ): string {
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

  /**
   * Internal convenience method that returns a mixin applicator
   * for a given global namespace.
   *
   * @internal
   *
   * @param {Location} location global namespace
   * @returns mixin applicator bound to the specified namespace
   */
  public getMixinApplicator<Location extends keyof CombinedMixinsList>(location: Location) {
    const self = this

    const _applyMixin = <
      Namespace extends keyof CombinedMixinsList[Location],
      Breakpoint extends keyof CombinedMixinsList[Location][Namespace]
    >(
      namespace: Namespace,
      breakpoint: Breakpoint,
      value: CombinedMixinsList[Location][Namespace][Breakpoint]
    ): CombinedMixinsList[Location][Namespace][Breakpoint] => {
      try {
        const mixinsToApply = self.mixins.filter(
          m => m.location === location && m.namespace === namespace && m.breakpoint === breakpoint
        )

        if (mixinsToApply.length === 0) return value

        let _value = this.unlink(value)

        mixinsToApply.forEach(mixin => {
          _value = mixin.callback(_value as any)
        })

        return _value
      } catch {
        return value
      }
    }

    return {
      /** Apply mixins for the specified logic */
      applyMixin: _applyMixin,

      /** Obtain a more specific applicator for a local namespace */
      getNamespaceApplicator: <Namespace extends keyof CombinedMixinsList[Location]>(namespace: Namespace) => ({
        /** Apply mixins for the specified logic */
        applyMixin: <
          Breakpoint extends keyof CombinedMixinsList[Location][Namespace]
        >(
          breakpoint: Breakpoint,
          value: CombinedMixinsList[Location][Namespace][Breakpoint]
        ) => _applyMixin(namespace, breakpoint, value)
      })
    }
  }

  /**
   * Remove a mixin by its identifier
   *
   * @param {string} identifier mixin identifier returned by `addMixin`
   */
  public removeMixin(identifier: string) {
    this.mixins = this.mixins.filter(mixin => mixin.identifier !== identifier)
  }

  /**
   * Deep‑copy helper that unlinks objects,
   * producing copies without shared references.
   *
   * @param _value object to copy
   * @returns cloned object in a new memory space
   * @private
   */
  private unlink<T = any>(_value: T): T {
    if (Array.isArray(_value)) {
      return [..._value].map(child => this.unlink(child)) as T
    }

    if (typeof _value === "object" && Object.getPrototypeOf(_value) === Object.prototype) {
      return Object.fromEntries(
        Object.entries(_value as any).map(([key, value]) => [key, this.unlink(value)])
      ) as T
    }

    if (_value instanceof Address) {
      return Address.from(_value.toString()) as T
    }

    if (_value instanceof Amount) {
      return Amount.from(_value.toReadableBigNumber(), _value.decimalPlaces, true) as T
    }

    return _value
  }
}
