# Available Mixins

Currently, only the following internal-type mixins are available:

## buildCrossChainTransaction
Mixins that affect the logic for building a cross-chain exchange transaction

| Name                        | Data Type        | Description                                                                        |
|-----------------------------|------------------|------------------------------------------------------------------------------------|
| nativeAmountFinalized       | BigNumber        | The amount of the native currency required for the transaction has been determined |
| transferDataEncoded         | string           | Encoded data has been obtained for calling the transfer method                     |
| arrivalGasDataEncoded       | string           | Encoded call data for the arrival gas function has been obtained                   |
| multiCallTransactionRequest | ExecutorCallData | An exchange transaction request has been obtained                                  |
| approveTransactionRequest   | ExecutorCallData | An approve transaction request has been obtained                                   |
| outputAmountsCorrected      | [Amount, Amount] | The quota’s output values have been finalized                                      |
| quotaComputationFinalized   | ExchangeQuota    | The quota processing is complete                                                   |
| stargateSendV2CallData      | string           | Encoded data has been obtained to send the payload through Stargate                |

## computeQuotaExecutionGasUsage
Mixins that affect the logic for calculating the gas required to execute a quota

| Name                             | Data Type | Description                                                                              |
|----------------------------------|-----------|------------------------------------------------------------------------------------------|
| stargateSwapMessageGasUsage      | number    | The amount of gas needed to send a message and then perform an exchange through Stargate |
| stargateHollowMessageGasUsage    | number    | The amount of gas needed to send a message without a subsequent exchange                 |
| wrapTransactionGasUsage          | number    | The amount of gas that will be used to wrap the native token                             |
| unwrapTransactionGasUsage        | number    | The amount of gas that will be used to unwrap the native token                           |
| multiStepExchangeWrapperGasUsage | number    | The amount of gas needed to wrap the execution of multi-step exchanges                   |
| finalMultiplier                  | number    | The multiplier for the used gas                                                          |

## computeOnchainTradeGasUsage
Mixins that affect the logic for calculating the gas required for an exchange within a single network

| Name                  | Data Type | Description                                                                       |
|-----------------------|-----------|-----------------------------------------------------------------------------------|
| uniswapV3StepGasUsage | number    | The amount of gas spent on an exchange step through a UniswapV3-type pool         |
| uniswapV2StepGasUsage | number    | The amount of gas spent on an exchange step through a UniswapV2-type pool         |
| receiveNativeGasUsage | number    | The amount of gas needed to receive the native token at the end of the exchange   |
| routeInitialGasUsage  | number    | The amount of gas that will be consumed by additional exchange contract functions |

## fetchRoute
Mixins that affect the logic of retrieving and subsequently processing routes

| Name                        | Data Type        | Description                                                       |
|-----------------------------|------------------|-------------------------------------------------------------------|
| receivedFinalizedRoute      | SimulatedRoute   | Route filtering is complete                                       |
| wrapUnwrapVirtualRouteBuilt | SimulatedRoute   | A virtual route has been built for the wrap or unwrap transaction |

## createSingleChainTransaction
Mixins that affect the process of building an exchange transaction within a single network

| Name                  | Data Type     | Description                                                              |
|-----------------------|---------------|--------------------------------------------------------------------------|
| singleChainQuotaBuilt | ExchangeQuota | The construction of the single-network exchange quota has been completed |

## createSingleChainWrapUnwrapTransaction
Mixins that affect the process of building a wrap or unwrap transaction

| Name       | Data Type     | Description                               |
|------------|---------------|-------------------------------------------|
| quotaBuilt | ExchangeQuota | The quota construction has been completed |